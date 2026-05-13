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
import { randomUUID } from 'crypto';
import gm from 'gm';

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
  /** @deprecated No longer used — paths now use Node's `path.sep`/`path.join`. */
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
  [key: string]: unknown;
}

type UploaderRequestListener = (...args: never[]) => void;

export interface UploaderRequest {
  xhr?: boolean;
  files?: unknown;
  header(name: string): string | null | undefined;
  on(event: string, listener: UploaderRequestListener): unknown;
  pipe(dest: NodeJS.WritableStream): unknown;
  unpipe?(dest?: NodeJS.WritableStream): void;
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

// Default options interface — every field has a default, so all are required here.
interface DefaultOptions extends UploaderOptions {
  debug: boolean;
  safeName: boolean;
  validate: boolean;
  resize: boolean;
  crop: boolean;
  quality: number;
  thumbnails: boolean;
  thumbToSubDir: boolean;
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

  constructor(options?: UploaderOptions) {
    this.settings = { ...defaultOptions, ...(options ?? {}) };

    const dirKeys = ['tmpDir', 'publicDir', 'uploadDir'] as const;
    dirKeys.forEach((key) => {
      const dir = this.settings[key];
      if (!dir) return;
      const normalized = path.normalize(dir);
      this.settings[key] = normalized.endsWith(path.sep) ? normalized : normalized + path.sep;
    });

    if (this.settings.uploadUrl && !this.settings.uploadUrl.endsWith('/')) {
      this.settings.uploadUrl = this.settings.uploadUrl + '/';
    }
  }

  pathToRoot(): string {
    return __dirname;
  }

  _existsSync(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  private sanitizeFileName(name: string): string {
    return path.basename(String(name || '').replace(/\\/g, '/')).replace(/^\.+/, '');
  }

  private createResult(file: FileObject, error?: string): UploadResult {
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

  private safeUnlink(filePath?: string): void {
    if (!filePath) return;
    try {
      if (this._existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      this.logging(' safeUnlink() - could not remove file.', err);
    }
  }

  private destinationPath(uploadDir: string, fileName: string): string {
    const root = path.resolve(uploadDir);
    const target = path.resolve(root, fileName);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid destination path');
    }
    return target;
  }

  private normalizeFile(input: unknown): FileObject | null {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const raw = input as Record<string, unknown>;
    if (typeof raw.path === 'undefined') {
      return null;
    }

    const rawName = typeof raw.name === 'string' ? raw.name : raw.originalname;
    const nameStr = typeof rawName === 'string' ? rawName : '';
    const safeName = this.sanitizeFileName(nameStr || path.basename(String(raw.path)));
    if (!safeName) {
      return null;
    }

    const size = Number(raw.size);
    return {
      ...raw,
      path: String(raw.path),
      name: safeName,
      size: Number.isFinite(size) ? size : 0,
      type:
        typeof raw.type === 'string'
          ? raw.type
          : typeof raw.mimetype === 'string'
            ? raw.mimetype
            : '',
    };
  }

  private collectFiles(input: unknown): FileObject[] {
    const files: FileObject[] = [];
    const visit = (value: unknown): void => {
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
        const obj = value as Record<string, unknown>;
        Object.keys(obj).forEach((key) => visit(obj[key]));
      }
    };

    visit(input);
    return files;
  }

  removeFile(filename: string, callback?: () => void): void {
    const fName = this.sanitizeFileName(filename);
    if (fName && fName !== '') {
      const filePath = this.destinationPath(this.settings.uploadDir, fName);
      this.safeUnlink(filePath);
    }
    if (callback) callback();
  }

  uploadFile(req: UploaderRequest, done: UploadCallback): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    let totalFiles = 0;
    const files: FileObject[] = [];
    const info: UploadResult[] = [];
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

  private uploadXhrFile(req: UploaderRequest, done: UploadCallback): void {
    const rawName = req.header('x-file-name') ?? '';
    const sanitizedName = this.sanitizeFileName(rawName);
    const declaredSize = Number.parseInt(req.header('x-file-size') ?? '', 10);
    const file: FileObject = {
      name: sanitizedName,
      size: Number.isFinite(declaredSize) ? declaredSize : 0,
      type: '',
    };

    if (!sanitizedName || !Number.isFinite(declaredSize)) {
      done(this.createResult(file, 'Invalid upload headers'));
      return;
    }

    const extension = path.extname(sanitizedName).toLowerCase();
    const tmpfile = path.join(this.settings.tmpDir, randomUUID() + extension);
    file.path = tmpfile;

    let completed = false;
    let bytesWritten = 0;
    const complete = (result: UploadResult | FileObject): void => {
      if (completed) return;
      completed = true;
      done(result);
    };
    const fail = (message: string): void => {
      file.size = bytesWritten;
      this.safeUnlink(tmpfile);
      complete(this.createResult(file, message));
    };

    const ws = fs.createWriteStream(tmpfile, {
      flags: 'wx',
      mode: 0o600,
    });

    ws.on('error', (err: Error) => {
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

    req.on('data', (data: Buffer) => {
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

    req.on('error', (err: Error) => {
      this.logging(' uploadFile() - req.xhr - request stream failed.', err);
      ws.destroy();
      fail('Request stream failed.');
    });

    req.pipe(ws);
  }

  private processUploadedFile(
    file: FileObject,
    uploadedFiles: string[],
    callback: (info: UploadResult) => void
  ): void {
    let validationResult: string | false = false;
    if (this.settings.validate) {
      this.logging('  Validate File!');
      validationResult = this.validate(file);
    }

    this.safeName(uploadedFiles, file.name, (safeName: string) => {
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

  moveFile(
    file: FileObject,
    dest: string,
    inValid: string | false,
    callback: (info: UploadResult) => void
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const source = file.path;
    const info: UploadResult = {
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
      return (result: UploadResult): void => {
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
      const fail = (message: string, targetPath?: string, err?: Error): void => {
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

      const startMove = (attempt = 0): void => {
        let targetPath: string;
        try {
          targetPath = self.destinationPath(dest, info.name);
        } catch {
          fail('Invalid destination path');
          return;
        }

        const os = fs.createWriteStream(targetPath, { flags: 'wx' });
        let outputStarted = false;

        os.on('error', function (err: NodeJS.ErrnoException) {
          if (!outputStarted && err.code === 'EEXIST' && attempt < 10) {
            try {
              const existingFiles = fs.readdirSync(dest);
              self.safeName(existingFiles, info.name, function (nextName: string) {
                info.name = nextName;
                info.url = self.settings.uploadUrl + info.name;
                startMove(attempt + 1);
              });
            } catch (readErr) {
              fail('Error accessing upload directory', targetPath, readErr as Error);
            }
            return;
          }
          fail('Sorry, could not open writestream.', targetPath, err);
        });

        os.on('open', function () {
          outputStarted = true;
          const is = fs.createReadStream(source);
          is.on('error', function (err: Error) {
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

          const failImage = (err?: Error | null): void => {
            os.destroy();
            fail('Image processing failed.', targetPath, err ?? undefined);
          };

          if (self.settings.imageTypes.test(info.originalName)) {
            if (self.settings.resize) {
              self.logging(' Resize image: ', self.settings.newSize);
              const gM = gm(is, info.originalName);
              if (Array.isArray(self.settings.newSize)) {
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
            } else if (self.settings.crop && self.settings.coordinates) {
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
      info.error = inValid as string; // inValid is the error message when it's not false
      finish(info);
    }
  }

  safeCreateDirectory(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      this.logging(' Create target directory: ' + dir);
    } catch (err) {
      this.logging(' safeCreateDirectory() - could not create directory.', err);
    }
  }

  safeName(files: string[], name: string, cb: SafeNameCallback): void {
    name = this.sanitizeFileName(name) || 'file';
    const usedNames = new Set(files.map((file) => file.toLowerCase()));

    while (usedNames.has(name.toLowerCase())) {
      name = name.replace(this.settings.nameCountRegexp, this.settings.nameCountFunc);
    }

    this.logging('  final: ' + name);
    cb(name);
  }

  validate(file: FileObject): string | false {
    if (this.settings.minFileSize && this.settings.minFileSize > file.size) {
      return 'File is too small';
    }
    if (this.settings.maxFileSize && this.settings.maxFileSize < file.size) {
      return 'File is too big';
    }
    if (!this.settings.acceptFileTypes.test(file.name)) {
      return 'Filetype not allowed';
    }
    return false;
  }

  createThumbnail(info: UploadResult, cb: (info: UploadResult) => void): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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
        thumbSizes.forEach(function (thumbSize: number | [number, number]) {
          self.logging('Create Thumbnail: ', thumbSize);
          let thumbSubDir = self.settings.uploadDir;
          let thumbSubUrl = self.settings.uploadUrl;
          let thumbName = '';
          let width: number;
          let height: number | undefined;

          if (Array.isArray(thumbSize)) {
            width = thumbSize[0];
            height = thumbSize[1] || thumbSize[0];
            const sizesStr = width + 'x' + height;
            if (self.settings.thumbToSubDir) {
              thumbSubDir = path.join(thumbSubDir, sizesStr);
              thumbSubUrl += sizesStr + '/';
            }
            thumbName += 'thumb_' + sizesStr + '_';
          } else {
            width = thumbSize;
            if (self.settings.thumbToSubDir) {
              thumbSubDir = path.join(thumbSubDir, String(thumbSize));
              thumbSubUrl += thumbSize + '/';
            }
            thumbName += 'thumb_' + thumbSize + '_';
          }

          if (self.settings.thumbToSubDir) {
            thumbName = info.name;
            self.safeCreateDirectory(thumbSubDir);
          } else {
            thumbName += info.name;
          }

          const sourcePath = path.join(info.destinationDir, info.name);
          const targetPath = path.join(thumbSubDir, thumbName);
          const completeThumbnail = (url: string, key: string): void => {
            info.thumbnails.push(url);
            info.thumbnailObj[key] = url;
            if (--totalSizes === 0) {
              cb(info);
            }
          };
          if (height !== undefined) {
            gm(sourcePath)
              .type('Optimize')
              .thumb(width, height, targetPath, 90, function (err) {
                if (err) {
                  self.logging('optimize: ', err);
                  if (--totalSizes === 0) {
                    cb(info);
                  }
                  return;
                }
                completeThumbnail(thumbSubUrl + thumbName, util.format('%s_%s', width, height));
              });
          } else {
            gm(sourcePath)
              .resize(width)
              .quality(self.settings.quality)
              .write(targetPath, function (err) {
                if (err) {
                  self.logging('resize: ', err);
                  if (--totalSizes === 0) {
                    cb(info);
                  }
                  return;
                }
                completeThumbnail(thumbSubUrl + thumbName, util.format('%s', width));
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

  logging(...args: unknown[]): void {
    if (this.settings.debug) {
      for (const arg of args) {
        console.log(util.inspect(arg, { colors: true, depth: null }));
      }
    }
  }

  uploadInfo(finfo: UploadResult): void {
    this.logging('  File: ' + finfo.originalName);
    this.logging('  Upload: ' + (finfo.success ? 'Completed' : 'Failed'));
    if (finfo.success) {
      this.logging('  Destination Directory: ' + finfo.destinationDir);
      this.logging('  Destination name: ' + finfo.name);
    } else {
      this.logging('  Error: ' + finfo.error);
    }
  }
}
