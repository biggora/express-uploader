'use strict';
/*
 * The MIT License
 *
 * Copyright 2013 Alexey Gordejev <aleksej@gordejev.lv>.
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
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const fs = __importStar(require('fs'));
const path = __importStar(require('path'));
const express_1 = __importDefault(require('express'));
const multer_1 = __importDefault(require('multer'));
const body_parser_1 = __importDefault(require('body-parser'));
const method_override_1 = __importDefault(require('method-override'));
const cookie_parser_1 = __importDefault(require('cookie-parser'));
const morgan_1 = __importDefault(require('morgan'));
const express_uploader_1 = require('../lib/express-uploader');
const app = (0, express_1.default)();
// Configuration
app.use((0, morgan_1.default)('dev'));
// Configure multer for file uploads
const storage = multer_1.default.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = (0, multer_1.default)({
  storage: storage,
  preservePath: true,
});
// Use multer middleware for multipart form data
app.use(upload.any()); // This handles multipart uploads similar to multiparty
// parse application/x-www-form-urlencoded
app.use(body_parser_1.default.urlencoded({ extended: false }));
// parse application/json
app.use(body_parser_1.default.json());
// parse application/vnd.api+json as json
app.use(body_parser_1.default.json({ type: 'application/vnd.api+json' }));
app.use((0, method_override_1.default)('X-HTTP-Method')); // Microsoft
app.use((0, method_override_1.default)('X-HTTP-Method-Override')); // Google/GData
app.use((0, method_override_1.default)('X-Method-Override')); // IBM
app.use((0, method_override_1.default)('_method')); // simulate DELETE and PUT
app.use(
  (0, method_override_1.default)((req, res) => {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      const method = req.body._method;
      delete req.body._method;
      return method;
    }
  }),
);
app.use((0, cookie_parser_1.default)('weritas10'));
/*
 * Display upload form
 */
app.all('/', (req, res) => {
  res.send(
    '<form action="/upload" method="post" enctype="multipart/form-data">' +
      '  <input type="file" name="upload-file"  multiple="true">' +
      '  <input type="submit" value="Upload">' +
      '</form>',
  );
});
/*
 * Route that takes the post upload request and sends the server response
 */
app.all('/upload', (req, res, next) => {
  const uploader = new express_uploader_1.Uploader({
    debug: true,
    validate: true,
    thumbnails: true,
    thumbToSubDir: true,
    tmpDir: path.join(__dirname, 'tmp'),
    publicDir: path.join(__dirname, 'public'),
    uploadDir: path.join(__dirname, 'public', 'files'),
    uploadUrl: '/files/',
    thumbSizes: [140, [100, 100]],
  });
  uploader.uploadFile(req, (data) => {
    res.set('Content-Type', 'text/plain');
    res.status(200).send(JSON.stringify(data));
  });
});
// Create tmp dir
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { mode: 0o755 });
}
app.listen(3000, '127.0.0.1', () => {
  console.log('Express server listening on %s:%d for uploads', '127.0.0.1', 3000);
});
