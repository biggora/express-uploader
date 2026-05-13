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

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { v1 as uuidv1 } from 'uuid';
import * as gm from 'gm';

// Define interfaces for type safety
export interface UploaderOptions {
  debug?: boolean;
  safeName?: boolean;
  validate?: boolean;
  resize?: boolean;
  crop?: boolean;
  quality?: number;
  thumbnails?: boolean;
  thumbToSubDir?: boolean;
  osSep?: string;
  tmpDir?: string;
  publicDir?: string;
  uploadDir?: string;
  uploadUrl?: string;
  maxPostSize?: number;
  minFileSize?: number;
  maxFileSize?: number;
  acceptFileTypes?: RegExp;
  thumbSizes?: Array<number | [number, number]>;
  newSize?: [number, number];
  coordinates?: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
  inlineFileTypes?: RegExp;
  imageTypes?: RegExp;
}

export interface FileObject {
  path?: string;
  name: string;
  size: number;
  type: string;
  success?: boolean;
  error?: string;
  safeName?: string;
  [key: string]: any; // Allow additional properties
}

export interface UploadResult {
  originalName: string;
  name: string;
  size: number;
  type: string;
  destinationDir: string;
  url: string;
  thumbnails: string[];
  thumbnailObj: { [key: string]: string };
  success?: boolean;
  error?: string;
}

export interface SafeNameCallback {
  (name: string): void;
}

export interface UploadCallback {
  (result: UploadResult | UploadResult[] | FileObject): void;
}

// Default options interface
interface DefaultOptions extends UploaderOptions {
  osSep: string;
  tmpDir: string;
  publicDir: string;
  uploadDir: string;
  uploadUrl: string;
  maxPostSize: number;
  minFileSize: number;
  maxFileSize: number;
  acceptFileTypes: RegExp;
  thumbSizes: Array<number | [number, number]>;
  newSize: [number, number];
  coordinates: {
    width: number;
    height: number;
    x: number;
    y: number;
  };
  inlineFileTypes: RegExp;
  imageTypes: RegExp;
  nameCountRegexp: RegExp;
  nameCountFunc: (match: string, index: string, ext: string) => string;
}

const defaultOptions: DefaultOptions = {
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
  maxPostSize: 11000000, // 110 MB
  minFileSize: 1,
  maxFileSize: 10000000, // 100 MB
  acceptFileTypes: /.+/i,
  thumbSizes: [[100, 100]],
  newSize: [800, 600],
  coordinates: { width: 800, height: 600, x: 0, y: 0 },
  inlineFileTypes: /\.(gif|jpe?g|png)$/i,
  imageTypes: /\.(gif|jpe?g|png)$/i,
  nameCountRegexp: /(?:(?:_([\d]+))?(\.[^.]+))?$/,
  nameCountFunc: function (s: string, index: string, ext: string) {
    return '_' + ((parseInt(index, 10) || 0) + 1) + '' + (ext || '');
  },
};

export class Uploader {
  public settings: DefaultOptions;
  private osSep: string;

  constructor(options?: UploaderOptions) {
    // Create settings object by copying defaults
    this.settings = { ...defaultOptions };

    // Override with user options
    if (options) {
      Object.keys(options).forEach((key: string) => {
        if (Object.prototype.hasOwnProperty.call(options, key)) {
          (this.settings as any)[key] = (options as any)[key];
        }
      });
    }

    // Normalize directory paths
    ['tmpDir', 'publicDir', 'uploadDir'].forEach((key) => {
      if (this.settings[key as keyof DefaultOptions]) {
        const dir = this.settings[key as keyof DefaultOptions] as string;
        if (dir) {
          const normalizedDir = path.normalize(dir as string);
          const sep = this.settings.osSep;
          if (!new RegExp(sep.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&') + '$').test(normalizedDir)) {
            (this.settings as any)[key] = normalizedDir + sep;
          } else {
            (this.settings as any)[key] = normalizedDir;
          }
        }
      }
    });

    this.osSep = this.settings.osSep;
  }

  pathToRoot(): string {
    return __dirname;
  }

  _existsSync(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch (err) {
      return false;
    }
  }

  utf8encode(str: string): string {
    return unescape(encodeURIComponent(str));
  }

  removeFile(filename: string, callback?: () => void): void {
    const fName = path.basename(filename);
    if (fName && fName !== '') {
      const filePath = this.settings.uploadDir + this.osSep + fName;
      if (this._existsSync(filePath)) {
        fs.unlinkSync(filePath); // Sync version for simplicity
      }
    }
    if (callback) callback();
  }

  uploadFile(req: any, done: UploadCallback): void {
    const self = this;
    let totalFiles = 0;
    const files: FileObject[] = [];
    const info: UploadResult[] = [];
    const toUpload = req.files;

    self.logging('Start Uploader!');
    self.safeCreateDirectory(self.settings.tmpDir);
    self.safeCreateDirectory(self.settings.publicDir);
    self.safeCreateDirectory(self.settings.uploadDir);
    req.files = {};

    // Direct async xhr stream data upload, yeah baby.
    if (req.xhr && !Object.keys(toUpload).length) {
      const fname = req.header('x-file-name');
      const fsize = parseInt(req.header('x-file-size'), 10);
      const extension = path.extname(fname).toLowerCase();
      // Be sure you can write to '/tmp/'
      const tmpfile = self.settings.tmpDir + uuidv1() + extension;
      const file: FileObject = {
        path: tmpfile,
        name: fname,
        size: fsize,
        type: '',
      };

      // Open a temporary writestream
      const ws = fs.createWriteStream(tmpfile, {
        flags: 'w',
        encoding: 'binary',
        mode: 0o755,
      });

      ws.on('error', function (err) {
        self.logging(' uploadFile() - req.xhr - could not open writestream.');
        file.success = false;
        file.error = 'Sorry, could not open writestream.';
        done(file);
      });

      ws.on('close', function (err?: Error) {
        let validationResult: string | false = false;
        if (self.settings.validate) {
          self.logging('  Validate File!');
          validationResult = self.validate(file);
        }
        self.moveFile(file, self.settings.uploadDir, validationResult, function (finfo) {
          self.uploadInfo(finfo);
          self.logging('Uploader closed!');
          done(finfo);
        });
      });

      ws.on('open', function () {
        self.logging('Stream Open!');
        req.pipe(ws);
      });

      // Writing filedata into writestream
      req.on('data', function (data: Buffer) {
        self.logging('Uploader onData!');
        // ws.write(data);
      });

      req.on('end', function () {
        self.logging('Uploader onEnd!');
        ws.end();
      });
    } else {
      Object.keys(toUpload).forEach(function (key) {
        if (Object.prototype.toString.call(toUpload[key]) === '[object Array]') {
          toUpload[key].forEach(function (rfile: FileObject) {
            if (typeof rfile.path !== 'undefined') {
              ++totalFiles;
              files.push(rfile);
            } else if (typeof rfile === 'object') {
              for (const i in rfile) {
                if (typeof rfile[i].path !== 'undefined') {
                  ++totalFiles;
                  files.push(rfile[i]);
                }
              }
            }
          });
        } else {
          if (typeof toUpload[key].path !== 'undefined') {
            ++totalFiles;
            files.push(toUpload[key]);
          } else if (typeof toUpload[key] === 'object') {
            const iFile = toUpload[key];
            for (const i in iFile) {
              if (typeof iFile[i].path !== 'undefined') {
                ++totalFiles;
                files.push(iFile[i]);
              }
            }
          }
        }
      });

      self.logging(' Received files: ' + totalFiles);
      if (totalFiles > 0) {
        fs.readdir(self.settings.uploadDir, function (err, uploadedFiles) {
          if (err) {
            self.logging('Error reading upload directory: ' + (err as Error).message);
            const errorResult: UploadResult = {
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

          files.forEach(function (file: FileObject) {
            let inValid = false;
            let validationResult: string | false = false;
            if (self.settings.validate) {
              self.logging('  Validate File!');
              validationResult = self.validate(file);
            }

            self.safeName(uploadedFiles, file.name, function (safeName: string) {
              if (self.settings.safeName) {
                file.safeName = safeName;
              } else {
                file.safeName = path.basename(file.path || '');
              }

              self.moveFile(file, self.settings.uploadDir, validationResult, function (fInfo) {
                self.createThumbnail(fInfo, function (finfo) {
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
          });
        });
      } else {
        const errorResult: UploadResult = {
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

  moveFile(
    file: FileObject,
    dest: string,
    inValid: string | false,
    callback: (info: UploadResult) => void,
  ): void {
    const self = this;
    const source = file.path;
    const info: UploadResult = {
      originalName: file.name,
      name: file.safeName || file.name,
      size: file.size,
      type: file.type,
      destinationDir: dest,
      url: '',
      thumbnails: [],
      thumbnailObj: {},
    };

    self.logging(' moveFile() - Start moving.');

    info.url = self.settings.uploadUrl + info.name;

    if (inValid === false) {
      if (!source) {
        info.success = false;
        info.error = 'File path is required';
        callback(info);
        return;
      }
      try {
        const is = fs.createReadStream(source);
        is.on('error', function (err: Error) {
          self.logging(' moveFile() - Could not open readstream.');
          info.success = false;
          info.error = 'Sorry, could not open readstream.';
          callback(info);
        });

        is.on('open', function () {
          const os = fs.createWriteStream(dest + info.name);
          os.on('error', function (err: Error) {
            self.logging(' moveFile() - Could not open writestream.', err);
            info.success = false;
            info.error = 'Sorry, could not open writestream.';
            callback(info);
          });

          os.on('open', function () {
            if (self.settings.imageTypes.test(info.originalName)) {
              if (self.settings.resize && self.settings.imageTypes.test(info.originalName)) {
                self.logging(' Resize image: ', self.settings.newSize);
                const gM = (gm as any)(is, info.originalName);
                if (Object.prototype.toString.call(self.settings.newSize) === '[object Array]') {
                  const size = self.settings.newSize as [number, number];
                  if (size[1]) {
                    (gM as any).resize(size[0], size[1]);
                  } else {
                    (gM as any).resize(size[0]);
                  }
                } else {
                  (gM as any).resize(self.settings.newSize[0]);
                }
                (gM as any).quality(self.settings.quality).stream().pipe(os);
              } else if (
                self.settings.crop &&
                self.settings.coordinates &&
                self.settings.imageTypes.test(info.originalName)
              ) {
                self.logging(' Crop image: ', self.settings.coordinates);
                const cO = self.settings.coordinates;
                const gM = (gm as any)(is, info.originalName);
                (gM as any)
                  .crop(cO.width, cO.height, cO.x, cO.y)
                  .quality(self.settings.quality)
                  .stream()
                  .pipe(os);
              } else {
                is.pipe(os);
              }
            } else {
              is.pipe(os);
            }
            os.on('close', function () {
              info.success = true;
              info.error = undefined;
              self.logging(' moveFile() - End moving.');
              process.nextTick(function () {
                fs.unlinkSync(source);
                callback(info);
              });
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
      if (source) {
        fs.unlinkSync(source);
      }
      info.success = false;
      info.error = inValid as string; // inValid is the error message when it's not false
      callback(info);
    }
  }

  safeCreateDirectory(dir: string): void {
    const self = this;
    let fullPath = /^win/i.test(process.platform) ? '' : '/';
    const parts = path.normalize(dir).split(self.settings.osSep);

    parts.forEach(function (part: string) {
      if (part !== '') {
        fullPath = path.normalize(path.join(fullPath, part));
        if (/\.$/.test(fullPath)) {
          fullPath = fullPath.replace(/\.$/, self.settings.osSep);
        }
        if (part !== '' && !self._existsSync(fullPath)) {
          try {
            fs.mkdirSync(fullPath, { mode: 0o755 });
            self.logging(' Create target directory: ' + fullPath);
          } catch (err) {
            // Directory may already exist or there's a permission issue
          }
        }
      }
    });
  }

  safeName(files: string[], name: string, cb: SafeNameCallback): void {
    const self = this;
    const total = files.length;

    // Prevent directory traversal and creating hidden system files:
    name = path.basename(name).replace(/^\.+/, '');

    // Prevent overwriting existing files:
    for (const f in files) {
      while (new RegExp(name + '$', 'i').test(files[f])) {
        name = name.toString().replace(self.settings.nameCountRegexp, self.settings.nameCountFunc);
      }
    }

    self.logging('  final: ' + name);
    cb(name);
  }

  validate(file: FileObject): string | false {
    const self = this;
    let error: string | false = false;

    if (self.settings.minFileSize && self.settings.minFileSize > file.size) {
      error = 'File is too small';
    } else if (self.settings.maxFileSize && self.settings.maxFileSize < file.size) {
      error = 'File is too big';
    } else if (!self.settings.acceptFileTypes.test(file.name)) {
      error = 'Filetype not allowed';
    }

    return error;
  }

  createThumbnail(info: UploadResult, cb: (info: UploadResult) => void): void {
    const self = this;
    if (self.settings.thumbnails && self.settings.imageTypes.test(info.originalName)) {
      self.logging('Create Thumbnails!');
      const thumbSizes = self.settings.thumbSizes || [];
      let totalSizes = thumbSizes.length;

      if (totalSizes > 0) {
        thumbSizes.forEach(function (thumbSize: number | [number, number]) {
          self.logging('Create Thumbnail: ', thumbSize);
          let thumbSubDir = self.settings.uploadDir;
          let thumbSubUrl = self.settings.uploadUrl;
          let thumbName = '';
          const imgData: { width: number; height?: number } = {} as any;

          if (Object.prototype.toString.call(thumbSize) === '[object Array]') {
            const size = thumbSize as [number, number];
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
            imgData.width = thumbSize as number;
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
          if (imgData.height) {
            (gm as any)(destinationDir + self.osSep + info.name)
              .type('Optimize')
              .thumb(
                imgData.width,
                imgData.height,
                thumbSubDir + self.osSep + thumbName,
                90,
                function (err?: Error) {
                  if (err) {
                    console.log('optimize: ', err);
                    // throw err;
                  }
                  info.thumbnails.push(thumbSubUrl + thumbName);
                  const key = util.format('%s_%s', imgData.width, imgData.height);
                  info.thumbnailObj[key] = thumbSubUrl + thumbName;
                  if (--totalSizes === 0) {
                    cb(info);
                  }
                },
              );
          } else {
            (gm as any)(destinationDir + self.osSep + info.name)
              .resize(imgData.width)
              .quality(self.settings.quality)
              .write(thumbSubDir + self.osSep + thumbName, function (err?: Error) {
                if (err) {
                  console.log('resize: ', err);
                  // throw err;
                }
                info.thumbnails.push(thumbSubUrl + thumbName);
                const key = util.format('%s', imgData.width);
                info.thumbnailObj[key] = thumbSubUrl + thumbName;
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
  }

  logging(...args: any[]): void {
    if (this.settings.debug) {
      for (const arg in arguments) {
        console.log(util.inspect(arguments[arg], { colors: true, depth: null }));
      }
    }
  }

  uploadInfo(finfo: UploadResult): void {
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
