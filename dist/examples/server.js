'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const tslib_1 = require('tslib');
const fs = tslib_1.__importStar(require('fs'));
const path = tslib_1.__importStar(require('path'));
const express_1 = tslib_1.__importDefault(require('express'));
const multer_1 = tslib_1.__importDefault(require('multer'));
const body_parser_1 = tslib_1.__importDefault(require('body-parser'));
const method_override_1 = tslib_1.__importDefault(require('method-override'));
const cookie_parser_1 = tslib_1.__importDefault(require('cookie-parser'));
const morgan_1 = tslib_1.__importDefault(require('morgan'));
const express_uploader_1 = require('../lib/express-uploader');
const app = (0, express_1.default)();
// Configuration
app.use((0, morgan_1.default)('dev'));
// Configure multer for file uploads (using new Multer 2.x+ API)
const storage = multer_1.default.diskStorage({
  destination: function (req, file, callback) {
    const uploadDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    callback(null, uploadDir);
  },
  filename: function (req, file, callback) {
    // Generate unique filename to prevent conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    callback(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = (0, multer_1.default)({
  storage: storage,
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
  (0, method_override_1.default)((req, _res) => {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      const method = req.body._method;
      delete req.body._method;
      return method;
    }
  })
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
      '</form>'
  );
});
/*
 * Route that takes the post-upload request and sends the server response
 */
app.all('/upload', (req, res, _next) => {
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
//# sourceMappingURL=server.js.map
