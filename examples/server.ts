import * as fs from 'fs';
import * as path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { Uploader } from '../lib/express-uploader';

const app: express.Application = express();

// Configuration
app.use(morgan('dev'));

// Configure multer for file uploads (using new Multer 2.x+ API)
const storage = multer.diskStorage({
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

const upload = multer({
  storage: storage,
});

// Use multer middleware for multipart form data
app.use(upload.any()); // This handles multipart uploads similar to multiparty

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());
// parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));
app.use(methodOverride('X-HTTP-Method')); // Microsoft
app.use(methodOverride('X-HTTP-Method-Override')); // Google/GData
app.use(methodOverride('X-Method-Override')); // IBM
app.use(methodOverride('_method')); // simulate DELETE and PUT
app.use(
  methodOverride((req: Request, _res: Response) => {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      // look in urlencoded POST bodies and delete it
      const method = req.body._method;
      delete req.body._method;
      return method;
    }
  }),
);
app.use(cookieParser('weritas10'));

/*
 * Display upload form
 */
app.all('/', (req: Request, res: Response) => {
  res.send(
    '<form action="/upload" method="post" enctype="multipart/form-data">' +
      '  <input type="file" name="upload-file"  multiple="true">' +
      '  <input type="submit" value="Upload">' +
      '</form>',
  );
});

/*
 * Route that takes the post-upload request and sends the server response
 */
app.all('/upload', (req: Request, res: Response, _next: NextFunction) => {
  const uploader = new Uploader({
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

  uploader.uploadFile(req, (data: unknown) => {
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
