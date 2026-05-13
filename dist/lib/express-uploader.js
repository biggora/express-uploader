'use strict';
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
Object.defineProperty(exports, '__esModule', { value: true });
exports.Uploader = void 0;
const tslib_1 = require('tslib');
const fs = tslib_1.__importStar(require('fs'));
const path = tslib_1.__importStar(require('path'));
const util = tslib_1.__importStar(require('util'));
const crypto_1 = require('crypto');
const gm = tslib_1.__importStar(require('gm'));
const defaultOptions = {
  debug: false,
  safeName: true,
  validate: false,
  resize: false,
  crop: false,
  quality: 80,
  thumbnails: false,
  thumbToSubDir: false,
  osSep: /^win/i.test(process.platform) ? '\\' : '/',
  tmpDir: path.join(__dirname, 'tmp'),
  publicDir: path.join(__dirname, 'public'),
  uploadDir: path.join(__dirname, 'public', 'files'),
  uploadUrl: '/files/',
  maxPostSize: 11000000,
  minFileSize: 1,
  maxFileSize: 10000000,
  acceptFileTypes: /.+/i,
  thumbSizes: [[100, 100]],
  newSize: [800, 600],
  coordinates: { width: 800, height: 600, x: 0, y: 0 },
  inlineFileTypes: /\.(gif|jpe?g|png)$/i,
  imageTypes: /\.(gif|jpe?g|png)$/i,
  nameCountRegexp: /(?:(?:_([\d]+))?(\.[^.]+))?$/,
  nameCountFunc: function (s, index, ext) {
    return '_' + ((parseInt(index, 10) || 0) + 1) + '' + (ext || '');
  },
};
class Uploader {
  constructor(options) {
    // Create settings object by copying defaults
    this.settings = { ...defaultOptions };
    // Override with user options
    if (options) {
      Object.keys(options).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(options, key)) {
          this.settings[key] = options[key];
        }
      });
    }
    // Normalize directory paths
    ['tmpDir', 'publicDir', 'uploadDir'].forEach((key) => {
      if (this.settings[key]) {
        const dir = this.settings[key];
        if (dir) {
          const normalizedDir = path.normalize(dir);
          const sep = this.settings.osSep;
          if (!new RegExp(sep.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&') + '$').test(normalizedDir)) {
            this.settings[key] = normalizedDir + sep;
          } else {
            this.settings[key] = normalizedDir;
          }
        }
      }
    });
    this.osSep = this.settings.osSep;
  }
  pathToRoot() {
    return __dirname;
  }
  _existsSync(filePath) {
    try {
      return fs.existsSync(filePath);
    } catch (err) {
      return false;
    }
  }
  sanitizeFileName(name) {
    return path.basename(String(name || '').replace(/\\/g, '/')).replace(/^\.+/, '');
  }
  createResult(file, error) {
    return {
      originalName: file.name,
      name: file.safeName || file.name,
      size: file.size,
      type: file.type,
      destinationDir: this.settings.uploadDir,
      url: this.settings.uploadUrl + (file.safeName || file.name),
      thumbnails: [],
      thumbnailObj: {},
      success: error ? false : undefined,
      error,
    };
  }
  safeUnlink(filePath) {
    if (!filePath) return;
    try {
      if (this._existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      this.logging(' safeUnlink() - could not remove file.', err);
    }
  }
  destinationPath(uploadDir, fileName) {
    const root = path.resolve(uploadDir);
    const target = path.resolve(root, fileName);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid destination path');
    }
    return target;
  }
  normalizeFile(input) {
    if (!input || typeof input !== 'object' || typeof input.path === 'undefined') {
      return null;
    }
    const rawName = typeof input.name === 'string' ? input.name : input.originalname;
    const safeName = this.sanitizeFileName(rawName || path.basename(String(input.path)));
    if (!safeName) {
      return null;
    }
    const size = Number(input.size);
    return {
      ...input,
      path: String(input.path),
      name: safeName,
      size: Number.isFinite(size) ? size : 0,
      type:
        typeof input.type === 'string'
          ? input.type
          : typeof input.mimetype === 'string'
            ? input.mimetype
            : '',
    };
  }
  collectFiles(input) {
    const files = [];
    const visit = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const file = this.normalizeFile(value);
      if (file) {
        files.push(file);
        return;
      }
      if (typeof value === 'object') {
        Object.keys(value).forEach((key) => visit(value[key]));
      }
    };
    visit(input);
    return files;
  }
  utf8encode(str) {
    return unescape(encodeURIComponent(str));
  }
  removeFile(filename, callback) {
    const fName = this.sanitizeFileName(filename);
    if (fName && fName !== '') {
      const filePath = this.destinationPath(this.settings.uploadDir, fName);
      this.safeUnlink(filePath);
    }
    if (callback) callback();
  }
  uploadFile(req, done) {
    const self = this;
    let totalFiles = 0;
    const files = [];
    const info = [];
    const toUpload = req.files || {};
    self.logging('Start Uploader!');
    self.safeCreateDirectory(self.settings.tmpDir);
    self.safeCreateDirectory(self.settings.publicDir);
    self.safeCreateDirectory(self.settings.uploadDir);
    req.files = {};
    // Direct async xhr stream data upload, yeah baby.
    if (req.xhr && !Object.keys(toUpload).length) {
      self.uploadXhrFile(req, done);
    } else {
      files.push(...self.collectFiles(toUpload));
      totalFiles = files.length;
      self.logging(' Received files: ' + totalFiles);
      if (totalFiles > 0) {
        fs.readdir(self.settings.uploadDir, function (err, uploadedFiles) {
          if (err) {
            self.logging('Error reading upload directory: ' + err.message);
            const errorResult = {
              originalName: '',
              name: '',
              size: 0,
              type: '',
              destinationDir: '',
              url: '',
              thumbnails: [],
              thumbnailObj: {},
              error: 'Error accessing upload directory',
            };
            done(errorResult);
            return;
          }
          files.forEach(function (file) {
            self.processUploadedFile(file, uploadedFiles, function (finfo) {
              info.push(finfo);
              if (--totalFiles === 0) {
                let totalUploaded = 0;
                info.forEach(function (inf) {
                  self.uploadInfo(inf);
                  if (inf.success) {
                    ++totalUploaded;
                  }
                });
                self.logging(' Total uploaded files: ' + totalUploaded);
                self.logging('Uploader closed!');
                done(info);
              }
            });
          });
        });
      } else {
        const errorResult = {
          originalName: '',
          name: '',
          size: 0,
          type: '',
          destinationDir: '',
          url: '',
          thumbnails: [],
          thumbnailObj: {},
          error: 'Not files found!',
        };
        done(errorResult);
      }
    }
  }
  uploadXhrFile(req, done) {
    const rawName = req.header('x-file-name');
    const sanitizedName = this.sanitizeFileName(rawName);
    const declaredSize = Number.parseInt(req.header('x-file-size'), 10);
    const file = {
      name: sanitizedName,
      size: Number.isFinite(declaredSize) ? declaredSize : 0,
      type: '',
    };
    if (!sanitizedName || !Number.isFinite(declaredSize)) {
      done(this.createResult(file, 'Invalid upload headers'));
      return;
    }
    const extension = path.extname(sanitizedName).toLowerCase();
    const tmpfile = path.join(this.settings.tmpDir, (0, crypto_1.randomUUID)() + extension);
    file.path = tmpfile;
    let completed = false;
    let bytesWritten = 0;
    const complete = (result) => {
      if (completed) return;
      completed = true;
      done(result);
    };
    const fail = (message) => {
      file.size = bytesWritten;
      this.safeUnlink(tmpfile);
      complete(this.createResult(file, message));
    };
    const ws = fs.createWriteStream(tmpfile, {
      flags: 'wx',
      mode: 0o600,
    });
    ws.on('error', (err) => {
      this.logging(' uploadFile() - req.xhr - could not open writestream.', err);
      fail('Sorry, could not open writestream.');
    });
    ws.on('close', () => {
      if (completed) {
        this.safeUnlink(tmpfile);
        return;
      }
      file.size = bytesWritten;
      fs.readdir(this.settings.uploadDir, (err, uploadedFiles) => {
        if (err) {
          this.safeUnlink(tmpfile);
          complete(this.createResult(file, 'Error accessing upload directory'));
          return;
        }
        this.processUploadedFile(file, uploadedFiles, (finfo) => {
          this.uploadInfo(finfo);
          this.logging('Uploader closed!');
          complete(finfo);
        });
      });
    });
    req.on('data', (data) => {
      bytesWritten += data.length;
      const exceedsPostSize = this.settings.maxPostSize && bytesWritten > this.settings.maxPostSize;
      const exceedsFileSize =
        this.settings.validate &&
        this.settings.maxFileSize &&
        bytesWritten > this.settings.maxFileSize;
      if (exceedsPostSize || exceedsFileSize) {
        if (typeof req.unpipe === 'function') {
          req.unpipe(ws);
        }
        ws.destroy();
        fail('File is too big');
      }
    });
    req.on('error', (err) => {
      this.logging(' uploadFile() - req.xhr - request stream failed.', err);
      ws.destroy();
      fail('Request stream failed.');
    });
    req.pipe(ws);
  }
  processUploadedFile(file, uploadedFiles, callback) {
    let validationResult = false;
    if (this.settings.validate) {
      this.logging('  Validate File!');
      validationResult = this.validate(file);
    }
    this.safeName(uploadedFiles, file.name, (safeName) => {
      if (this.settings.safeName) {
        file.safeName = safeName;
      } else {
        file.safeName = this.sanitizeFileName(path.basename(file.path || file.name));
      }
      uploadedFiles.push(file.safeName);
      this.moveFile(file, this.settings.uploadDir, validationResult, (fInfo) => {
        if (!fInfo.success) {
          callback(fInfo);
          return;
        }
        this.createThumbnail(fInfo, callback);
      });
    });
  }
  moveFile(file, dest, inValid, callback) {
    const self = this;
    const source = file.path;
    const info = {
      originalName: file.name,
      name: self.sanitizeFileName(file.safeName || file.name),
      size: file.size,
      type: file.type,
      destinationDir: dest,
      url: '',
      thumbnails: [],
      thumbnailObj: {},
    };
    self.logging(' moveFile() - Start moving.');
    info.url = self.settings.uploadUrl + info.name;
    const finish = (() => {
      let completed = false;
      return (result) => {
        if (completed) return;
        completed = true;
        callback(result);
      };
    })();
    if (inValid === false) {
      if (!source) {
        info.success = false;
        info.error = 'File path is required';
        finish(info);
        return;
      }
      let failed = false;
      const fail = (message, targetPath, err) => {
        failed = true;
        if (err) {
          self.logging(' moveFile() - ' + message, err);
        }
        if (targetPath) {
          self.safeUnlink(targetPath);
        }
        info.success = false;
        info.error = message;
        finish(info);
      };
      const startMove = (attempt = 0) => {
        let targetPath;
        try {
          targetPath = self.destinationPath(dest, info.name);
        } catch (err) {
          fail('Invalid destination path');
          return;
        }
        const os = fs.createWriteStream(targetPath, { flags: 'wx' });
        let outputStarted = false;
        os.on('error', function (err) {
          if (!outputStarted && err.code === 'EEXIST' && attempt < 10) {
            try {
              const existingFiles = fs.readdirSync(dest);
              self.safeName(existingFiles, info.name, function (nextName) {
                info.name = nextName;
                info.url = self.settings.uploadUrl + info.name;
                startMove(attempt + 1);
              });
            } catch (readErr) {
              fail('Error accessing upload directory', targetPath, readErr);
            }
            return;
          }
          fail('Sorry, could not open writestream.', targetPath, err);
        });
        os.on('open', function () {
          outputStarted = true;
          const is = fs.createReadStream(source);
          is.on('error', function (err) {
            os.destroy();
            fail('Sorry, could not open readstream.', targetPath, err);
          });
          os.on('close', function () {
            if (failed) return;
            info.success = true;
            info.error = undefined;
            self.logging(' moveFile() - End moving.');
            self.safeUnlink(source);
            finish(info);
          });
          const failImage = (err) => {
            os.destroy();
            fail('Image processing failed.', targetPath, err);
          };
          if (self.settings.imageTypes.test(info.originalName)) {
            if (self.settings.resize && self.settings.imageTypes.test(info.originalName)) {
              self.logging(' Resize image: ', self.settings.newSize);
              const gM = gm(is, info.originalName);
              if (Object.prototype.toString.call(self.settings.newSize) === '[object Array]') {
                const size = self.settings.newSize;
                if (size[1]) {
                  gM.resize(size[0], size[1]);
                } else {
                  gM.resize(size[0]);
                }
              } else {
                gM.resize(self.settings.newSize[0]);
              }
              gM.quality(self.settings.quality).stream(function (err, stdout) {
                if (err || !stdout) {
                  failImage(err);
                  return;
                }
                stdout.on('error', failImage);
                stdout.pipe(os);
              });
            } else if (
              self.settings.crop &&
              self.settings.coordinates &&
              self.settings.imageTypes.test(info.originalName)
            ) {
              self.logging(' Crop image: ', self.settings.coordinates);
              const cO = self.settings.coordinates;
              gm(is, info.originalName)
                .crop(cO.width, cO.height, cO.x, cO.y)
                .quality(self.settings.quality)
                .stream(function (err, stdout) {
                  if (err || !stdout) {
                    failImage(err);
                    return;
                  }
                  stdout.on('error', failImage);
                  stdout.pipe(os);
                });
            } else {
              is.pipe(os);
            }
          } else {
            is.pipe(os);
          }
        });
      };
      try {
        startMove();
      } catch (err) {
        self.logging(err);
        info.success = false;
        info.error = 'moveFile() - Exception.';
        finish(info);
      }
    } else {
      self.safeUnlink(source);
      info.success = false;
      info.error = inValid; // inValid is the error message when it's not false
      finish(info);
    }
  }
  safeCreateDirectory(dir) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      this.logging(' Create target directory: ' + dir);
    } catch (err) {
      this.logging(' safeCreateDirectory() - could not create directory.', err);
    }
  }
  safeName(files, name, cb) {
    const self = this;
    // Prevent directory traversal and creating hidden system files:
    name = self.sanitizeFileName(name) || 'file';
    const usedNames = new Set(files.map((file) => file.toLowerCase()));
    // Prevent overwriting existing files:
    while (usedNames.has(name.toLowerCase())) {
      name = name.toString().replace(self.settings.nameCountRegexp, self.settings.nameCountFunc);
    }
    self.logging('  final: ' + name);
    cb(name);
  }
  validate(file) {
    const self = this;
    let error = false;
    if (self.settings.minFileSize && self.settings.minFileSize > file.size) {
      error = 'File is too small';
    } else if (self.settings.maxFileSize && self.settings.maxFileSize < file.size) {
      error = 'File is too big';
    } else if (!self.settings.acceptFileTypes.test(file.name)) {
      error = 'Filetype not allowed';
    }
    return error;
  }
  createThumbnail(info, cb) {
    const self = this;
    if (
      info.success &&
      self.settings.thumbnails &&
      self.settings.imageTypes.test(info.originalName)
    ) {
      self.logging('Create Thumbnails!');
      const thumbSizes = self.settings.thumbSizes || [];
      let totalSizes = thumbSizes.length;
      if (totalSizes > 0) {
        thumbSizes.forEach(function (thumbSize) {
          self.logging('Create Thumbnail: ', thumbSize);
          let thumbSubDir = self.settings.uploadDir;
          let thumbSubUrl = self.settings.uploadUrl;
          let thumbName = '';
          const imgData = {};
          if (Object.prototype.toString.call(thumbSize) === '[object Array]') {
            const size = thumbSize;
            imgData.width = size[0];
            if (!size[1]) {
              size[1] = size[0];
            }
            imgData.height = size[1];
            const sizesStr = size.join('x');
            thumbSubDir += self.settings.thumbToSubDir ? sizesStr : '';
            thumbSubUrl += self.settings.thumbToSubDir ? sizesStr + '/' : '';
            thumbName += 'thumb_' + sizesStr + '_';
          } else {
            imgData.width = thumbSize;
            thumbSubDir += self.settings.thumbToSubDir ? thumbSize.toString() : '';
            thumbSubUrl += self.settings.thumbToSubDir ? thumbSize.toString() + '/' : '';
            thumbName += 'thumb_' + thumbSize + '_';
          }
          if (self.settings.thumbToSubDir) {
            thumbName = info.name;
            self.safeCreateDirectory(thumbSubDir);
          } else {
            thumbName += info.name;
          }
          const destinationDir = info.destinationDir.replace(/\/$|\\$/, '');
          const completeThumbnail = (url, key) => {
            info.thumbnails.push(url);
            info.thumbnailObj[key] = url;
            if (--totalSizes === 0) {
              cb(info);
            }
          };
          if (imgData.height) {
            gm(destinationDir + self.osSep + info.name)
              .type('Optimize')
              .thumb(
                imgData.width,
                imgData.height,
                thumbSubDir + self.osSep + thumbName,
                90,
                function (err) {
                  if (err) {
                    self.logging('optimize: ', err);
                    if (--totalSizes === 0) {
                      cb(info);
                    }
                    return;
                  }
                  completeThumbnail(
                    thumbSubUrl + thumbName,
                    util.format('%s_%s', imgData.width, imgData.height)
                  );
                }
              );
          } else {
            gm(destinationDir + self.osSep + info.name)
              .resize(imgData.width)
              .quality(self.settings.quality)
              .write(thumbSubDir + self.osSep + thumbName, function (err) {
                if (err) {
                  self.logging('resize: ', err);
                  if (--totalSizes === 0) {
                    cb(info);
                  }
                  return;
                }
                completeThumbnail(thumbSubUrl + thumbName, util.format('%s', imgData.width));
              });
          }
        });
      } else {
        cb(info);
      }
    } else {
      cb(info);
    }
  }
  logging(...args) {
    if (this.settings.debug) {
      for (const arg in arguments) {
        console.log(util.inspect(arguments[arg], { colors: true, depth: null }));
      }
    }
  }
  uploadInfo(finfo) {
    const self = this;
    self.logging('  File: ' + finfo.originalName);
    self.logging('  Upload: ' + (finfo.success ? 'Completed' : 'Failed'));
    if (finfo.success) {
      self.logging('  Destination Directory: ' + finfo.destinationDir);
      self.logging('  Destination name: ' + finfo.name);
    } else {
      self.logging('  Error: ' + finfo.error);
    }
  }
}
exports.Uploader = Uploader;
//# sourceMappingURL=express-uploader.js.map
