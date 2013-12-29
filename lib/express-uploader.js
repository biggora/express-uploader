/*
 * The MIT License
 *
 * Copyright 2013 Alexey Gordeyev <aleksej@gordejev.lv>.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

var fs = require('fs'),
        path = require('path'),
        util = require('util'),
        uuid = require('node-uuid'),
        gm = require('gm');

var defaultOptions = {
    debug: true,
    safeName: true,
    validate: false,
    thumbnails: false,
    thumbToSubDir: false,
    osSep: process.platform === 'win32' ? '\\' : '/',
    tmpDir: __dirname + '/tmp',
    publicDir: __dirname + '/public',
    uploadDir: __dirname + '/public/files',
    uploadUrl: '/files/',
    maxPostSize: 11000000, //000 110 MB
    minFileSize: 1,
    maxFileSize: 10000000, //0000 100 MB
    acceptFileTypes: /.+/i,
    thumbSizes: [[100, 100]],
    inlineFileTypes: /\.(gif|jpe?g|png)$/i,
    imageTypes: /\.(gif|jpe?g|png)$/i
};

module.exports = function Uploader(options) {
    var settings = {};
    Object.keys(defaultOptions).forEach(function(key) {
        settings[key] = defaultOptions[key];
    });
    if (options) {
        Object.keys(options).forEach(function(key) {
            settings[key] = options[key];
        });
    }
    Object.keys(settings).forEach(function(key) {
        switch (key) {
            case 'tmpDir':
            case 'publicDir':
            case 'uploadDir':
                settings[key] = path.normalize(settings[key]);
                if (!new RegExp(settings.osSep + '$').test(settings[key])) {
                    settings[key] = settings[key] + settings.osSep;
                }
                break;
        }
    });

    return {
        settings: settings,
        pathToRoot: function() {
            return __dirname;
        },
        _existsSync: fs.existsSync || path.existsSync,
        utf8encode: function(str) {
            return unescape(encodeURIComponent(str));
        },
        uploadFile: function(req, callback) {
            var self = this, totalFiles = 0, files = [], info = [];
            self.logging("Start Uploader!");
            self.safeCreateDirectory(self.settings.uploadDir);

            // Direct async xhr stream data upload, yeah baby.
            if (req.xhr && !Object.keys(req.files).length) {

                var fname = req.header('x-file-name');
                var fsize = parseInt(req.header('x-file-size'), 10);
                var extension = path.extname(fname).toLowerCase();
                self.safeCreateDirectory(self.settings.tmpDir);
                // Be sure you can write to '/tmp/'
                var tmpfile = self.settings.tmpDir + uuid.v1() + extension;
                var file = {
                    path: tmpfile,
                    name: fname,
                    size: fsize,
                    type: ""
                };
                // Open a temporary writestream
                var ws = fs.createWriteStream(tmpfile, {
                    flags: 'w',
                    encoding: 'binary',
                    mode: 0755
                });

                ws.on('error', function(err) {
                    self.logging(" uploadFile() - req.xhr - could not open writestream.");
                    file.success = false;
                    file.error = "Sorry, could not open writestream.";
                    callback(file);
                });
                ws.on('close', function(err) {
                    var inValid = false;
                    if (self.settings.validate) {
                        self.logging("  Validate File!");
                        inValid = self.validate(file);
                    }
                    self.moveFile(file, self.settings.uploadDir, inValid, function(finfo) {
                        self.uploadInfo(finfo);
                        self.logging("Uploader closed!");
                        callback(finfo);
                    });
                });
                ws.on('open', function() {
                    self.logging("Stream Open!");
                    req.pipe(ws);
                });
                // Writing filedata into writestream
                req.on('data', function(data) {
                    self.logging("Uploader onData!");
                    // ws.write(data);
                });
                req.on('end', function() {
                    self.logging("Uploader onEnd!");
                    ws.end();
                });
                // req.pipe(ws);
            } else {
                Object.keys(req.files).forEach(function(key) {
                    if (Object.prototype.toString.call(req.files[key]) === '[object Array]') {
                        req.files[key].forEach(function(rfile) {
                            if (typeof rfile.path !== 'undefined') {
                                ++totalFiles;
                                files.push(rfile);
                            }
                        });
                    } else {
                        if (typeof req.files[key].path !== 'undefined') {
                            ++totalFiles;
                            files.push(req.files[key]);
                        }
                    }
                });

                self.logging(' Total received files: ' + totalFiles);
                files.forEach(function(file) {
                    var inValid = false;

                    if (self.settings.validate) {
                        self.logging("  Validate File!");
                        inValid = self.validate(file);
                    }

                    self.moveFile(file, self.settings.uploadDir, inValid, function(fInfo) {
                        self.createThumbnail(fInfo, function(finfo) {
                            info.push(finfo);
                            if (--totalFiles === 0) {
                                var totalUploaded = 0;
                                info.forEach(function(inf) {
                                    self.uploadInfo(inf);
                                    if (inf.success) {
                                        ++totalUploaded;
                                    }
                                });
                                self.logging(' Total uploaded files: ' + totalUploaded);
                                // self.logging(info);
                                self.logging("Uploader closed!");
                                callback(info);
                            }
                        });
                    });
                });
            }
        },
        moveFile: function(file, dest, inValid, callback) {
            var self = this, source = file.path, info = {
                originalName: file.name,
                name: file.name,
                size: file.size,
                type: file.type,
                destinationDir: dest,
                url: '',
                thumbnails: []
            };

            if (self.settings.safeName) {
                info.name = path.basename(source);
            } else {
                info.name = self.safeName(info.name);
            }
            info.url = self.settings.uploadUrl + info.name;

            if (!inValid) {
                try {
                    var is = fs.createReadStream(source);
                    is.on('error', function(err) {
                        self.logging(' moveFile() - Could not open readstream.');
                        info.success = false;
                        info.error = 'Sorry, could not open readstream.';
                        callback(info);
                    });

                    is.on('open', function() {
                        var os = fs.createWriteStream(dest + info.name);
                        os.on('error', function(err) {
                            self.logging(' moveFile() - Could not open writestream.', err);
                            info.success = false;
                            info.error = 'Sorry, could not open writestream.';
                            callback(info);
                        });
                        os.on('open', function() {
                            is.pipe(os);
                            os.on('close', function() {
                                fs.unlinkSync(source);
                                info.success = true;
                                info.error = null;
                                callback(info);
                            });
                        });
                    });
                } catch (err) {
                    self.logging(err);
                    info.success = false;
                    info.error = 'moveFile() - Exception.';
                    callback(info);
                }
            } else {
                fs.unlinkSync(source);
                info.success = false;
                info.error = inValid;
                callback(info);
            }
        },
        safeCreateDirectory: function(dir) {
            var self = this,
                    fullPath = '',
                    parts = path.normalize(dir).split(self.settings.osSep);

            parts.forEach(function(part) {
                if (part !== '') {
                    fullPath = path.normalize(path.join(fullPath, part));
                    if (/\.$/.test(fullPath)) {
                        fullPath = fullPath.replace(/\.$/, self.settings.osSep);
                    }
                    if (!self._existsSync(fullPath)) {
                        self.logging(" Create target directory: " + fullPath);
                        fs.mkdirSync(fullPath, 755);
                    }
                }
            });
        },
        safeName: function(name) {
            var self = this, nname = '';
            // Prevent directory traversal and creating hidden system files:
            name = path.basename(name).replace(/^\.+/, '');
            // Prevent overwriting existing files:
            while (self._existsSync(self.settings.uploadDir + name)) {
                nname = name.replace(self.settings.nameCountRegexp, self.settings.nameCountFunc);
            }
            self.logging('  Make SafeName!');
            return nname;
        },
        validate: function(file) {
            var self = this, error = false;
            if (self.settings.minFileSize && self.settings.minFileSize > file.size) {
                error = 'File is too small';
            } else if (self.settings.maxFileSize && self.settings.maxFileSize < file.size) {
                error = 'File is too big';
            } else if (!self.settings.acceptFileTypes.test(file.name)) {
                error = 'Filetype not allowed';
            }
            return error;
        },
        createThumbnail: function(info, cb) {
            var self = this;
            if (self.settings.thumbnails) {
                self.logging("Create Thumbnails!");
                var thumbSizes = (self.settings.thumbSizes || []);
                var totalSizes = thumbSizes.length;
                if (totalSizes > 0) {
                    thumbSizes.forEach(function(thumbSize) {
                        self.logging("Create Thumbnail: ", thumbSize);
                        var thumbSubDir = self.settings.uploadDir;
                        var thumbSubUrl = self.settings.uploadUrl;
                        var thumbName = "";
                        var imgData = {};
                        
                        if (Object.prototype.toString.call(thumbSize) === '[object Array]') {
                            imgData.width = thumbSize[0];
                            imgData.height = thumbSize[1];
                            thumbSubDir += self.settings.thumbToSubDir ? thumbSize[0] + 'x' + thumbSize[1] : '';
                            thumbSubUrl += self.settings.thumbToSubDir ? thumbSize[0] + 'x' + thumbSize[1] + '/' : '';
                            thumbName += 'thumb_' + thumbSize[0] + 'x' + thumbSize[1] + '_';
                        } else {
                            imgData.width = thumbSize;
                            thumbSubDir += self.settings.thumbToSubDir ? thumbSize : '';
                            thumbSubUrl += self.settings.thumbToSubDir ? thumbSize + '/' : '';
                            thumbName += 'thumb_' + thumbSize + '_';
                        }

                        if (self.settings.thumbToSubDir) {
                            thumbName = info.name;
                            self.safeCreateDirectory(thumbSubDir);
                        } else {
                            thumbName += info.name;
                        }
                        if (imgData.height) {
                            gm(info.destinationDir + '/' + info.name)
                                    .thumb(imgData.width, imgData.height, thumbSubDir + '/' + thumbName, 100,
                                            function(err) {
                                                if (err) {
                                                    throw err;
                                                }
                                                info.thumbnails.push(thumbSubUrl + thumbName);
                                                console.log('resized ' + thumbName + ' to fit within ', thumbSize)
                                                if (--totalSizes === 0) {
                                                    cb(info);
                                                }
                                            });
                        } else {
                            gm(info.destinationDir + '/' + info.name)
                                    .resize(imgData.width)
                                    .write(thumbSubDir + '/' + thumbName, function(err) {
                                        if (err) {
                                            throw err;
                                        }
                                        info.thumbnails.push(thumbSubUrl + thumbName);
                                        console.log('resized ' + thumbName + ' to fit within ', thumbSize)
                                        if (--totalSizes === 0) {
                                            cb(info);
                                        }
                                    });
                        }
                    });
                } else {
                    cb(info);
                }
            } else {
                cb(info);
            }
        },
        logging: function() {
            if (this.settings.debug) {
                for (var arg in arguments) {
                    console.log(util.inspect(arguments[arg], {colors: true, depth: null}));
                }
            }
        },
        uploadInfo: function(finfo) {
            var self = this;
            self.logging("  File: " + finfo.originalName);
            self.logging('  Upload: ' + (finfo.success ? "Completed" : "Failed"));
            if (finfo.success) {
                self.logging("  Destination Directory: " + finfo.destinationDir);
                self.logging("  Destination name: " + finfo.name);
            } else {
                self.logging("  Error: " + finfo.error);
            }
        }
    };
};