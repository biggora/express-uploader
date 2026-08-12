[![npm version](https://img.shields.io/npm/v/express-uploader.svg)](https://www.npmjs.com/package/express-uploader)
[![CI](https://img.shields.io/github/actions/workflow/status/biggora/express-uploader/unit-tests.yml?branch=master)](https://github.com/biggora/express-uploader/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## File uploader

Uploading files middleware for NodeJS, Express, TrinteJS, Connect.

## Installation

```bash
npm install express-uploader
```

The package ships with TypeScript declarations (`dist/index.d.ts`) — no separate `@types/...` install is required.

## Requirements

- Node.js `>= 18.0.0`
- An upstream multipart parser on `req.files` (e.g. [`multer`](https://www.npmjs.com/package/multer)) for form uploads, or an XHR client setting `x-file-name` / `x-file-size` headers for streaming uploads.
- [GraphicsMagick](http://www.graphicsmagick.org/) (the `gm` CLI binary) on the host — only required if `resize`, `crop`, or `thumbnails` is enabled.

## Development

For development, after cloning the repository, install dependencies and run the
test suite:

    $ npm ci
    $ npm test

The default test command runs `vitest run`.

Useful maintainer commands:

    $ npm run build
    $ npm run example          # build, then start the example server on 127.0.0.1:3000
    $ npm run lint
    $ npm run typecheck

## Usage overview

### for TrinteJS

#### manual setup in project config/routes.js

```js

var Uploader = require('express-uploader');

module.exports = function routes(map) {
    ...
    map.all('/upload', function(req, res, next) {
        var uploader = new Uploader({
            debug: true,
            validate: true,
            thumbnails: true,
            thumbToSubDir: true,
            tmpDir: __dirname + '/tmp',
            publicDir: __dirname + '/public',
            uploadDir: __dirname + '/public/files',
            uploadUrl: '/files/',
            thumbSizes: [140, [100, 100]]
        });
        uploader.uploadFile(req, function(data) {
            res.type('text/plain').status(200).send(JSON.stringify(data));
        });
    });
};
```

### for ExpressJS

```js
var Uploader = require('express-uploader');

app.all('/upload', function (req, res, next) {
  var uploader = new Uploader({
    debug: true,
    validate: true,
    thumbnails: true,
    thumbToSubDir: true,
    tmpDir: __dirname + '/tmp',
    publicDir: __dirname + '/public',
    uploadDir: __dirname + '/public/files',
    uploadUrl: '/files/',
    thumbSizes: [140, [100, 100]],
  });
  uploader.uploadFile(req, function (data) {
    res.type('text/plain').status(200).send(JSON.stringify(data));
  });
});
```

### TypeScript / ES modules

```ts
import express from 'express';
import multer from 'multer';
import Uploader, { UploadResult } from 'express-uploader';

const app = express();
const parseMultipart = multer({ dest: `${__dirname}/tmp` });

const uploader = new Uploader({
  uploadDir: `${__dirname}/public/files`,
  uploadUrl: '/files/',
  validate: true,
  maxFileSize: 10_000_000,
});

app.post('/upload', parseMultipart.any(), (req, res) => {
  uploader.uploadFile(req, (data) => {
    if (Array.isArray(data)) {
      const successes = (data as UploadResult[]).filter((f) => f.success);
      res.json({ uploaded: successes });
    } else {
      res.status(400).json(data);
    }
  });
});
```

### NestJS (Express platform)

The `express-uploader/nest` subpath exports a `DynamicModule` and an injectable `UploaderService` that wraps the core's callback API in a Promise. The adapter targets `@nestjs/platform-express` only.

Install the Nest peers alongside the package:

```bash
npm install @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata
```

Register the module:

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { UploaderModule } from 'express-uploader/nest';
import { UploadController } from './upload.controller';

@Module({
  imports: [
    UploaderModule.forRoot({
      tmpDir: '/tmp/uploads',
      uploadDir: '/var/www/files',
      uploadUrl: '/files/',
      thumbnails: true,
      thumbSizes: [[100, 100], 200],
    }),
  ],
  controllers: [UploadController],
})
export class AppModule {}
```

Use it from a controller — multer is wired the standard Nest way via `FilesInterceptor`:

```ts
// upload.controller.ts
import { Controller, Post, Req, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';
import { UploaderService } from 'express-uploader/nest';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploader: UploaderService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10))
  async handle(@Req() req: ExpressRequest) {
    return this.uploader.upload(req);
  }
}
```

`UploaderService.upload(req)` returns a Promise that **never rejects** — per-file errors surface as `success: false` on each `UploadResult`, matching the core's contract.

`UploaderModule.forRootAsync({ useFactory, inject, imports })` is also available for config-driven setups.

### Next.js (Pages Router)

The `express-uploader/next` subpath exports a `withUploader(options)` HOF that returns a `NextApiHandler`. It embeds multer, shims `req.xhr` / `req.header()`, and exposes `onSuccess` / `onError` hooks. **App Router is not supported.**

Install the Next peers:

```bash
npm install next multer
```

Create the API route:

```ts
// pages/api/upload.ts
import { withUploader } from 'express-uploader/next';

export const config = {
  api: { bodyParser: false }, // multer must own the request stream
};

export default withUploader({
  uploadDir: './public/files',
  uploadUrl: '/files/',
  thumbnails: true,
  thumbSizes: [[100, 100]],
  multerLimits: { fileSize: 10 * 1024 * 1024 },
  fieldName: 'files', // omit to accept any field name
  onSuccess: (result, _req, res) => {
    res.status(201).json({ ok: true, result });
  },
  onError: (err, _req, res) => {
    res.status(400).json({ ok: false, error: err.message });
  },
});
```

Defaults when hooks are omitted: `200` JSON on success, `500` JSON on pipeline error. `GET` (and anything other than `POST`/`PUT`) returns `405` with an `Allow: POST, PUT` header.

`tmpDir` defaults to `os.tmpdir()/express-uploader` if not provided — the core's `__dirname/tmp` default would point inside `node_modules`, which is read-only on most serverless deploys.

### Removing files

```js
uploader.removeFile('avatar.txt', () => {
  // file at uploadDir/avatar.txt has been deleted (if it existed)
});
```

`removeFile` runs the same name sanitization as uploads, so `..` traversal and absolute paths are rejected.

### Callback result shape

The shape of `data` depends on how the upload arrived:

- **Form upload** (`req.files` populated by a multipart parser such as `multer`) — `data` is `UploadResult[]`, one entry per file. Use `Array.isArray(data)` to detect this branch.
- **XHR streaming upload** (`req.xhr === true`, `x-file-name` / `x-file-size` headers) — `data` is a single `UploadResult` object. On invalid headers or stream errors, it carries `success: false` and an `error` message.
- **Empty request** (no files attached) — `data` is a single synthetic `UploadResult` with `error: 'Not files found!'`.

## Options

| Name            | Type    | Default                               | Description                                                                                        |
| --------------- | ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| debug           | boolean | `false`                               | Enable verbose logging via `console.log`.                                                          |
| safeName        | boolean | `true`                                | Sanitize filenames and avoid collisions; disable to keep the originally provided name.             |
| validate        | boolean | `false`                               | Apply `minFileSize` / `maxFileSize` / `acceptFileTypes` checks before moving the file.             |
| quality         | number  | `80`                                  | JPEG quality (0–100) used when resizing/cropping via GraphicsMagick.                               |
| thumbnails      | boolean | `false`                               | Generate thumbnails for image uploads.                                                             |
| thumbToSubDir   | boolean | `false`                               | When `true`, thumbnails go to `uploadDir/<WxH>/<name>`; otherwise to `uploadDir/thumb_..._<name>`. |
| tmpDir          | string  | `<module>/tmp`                        | Temp directory for incoming uploads. Created if missing.                                           |
| publicDir       | string  | `<module>/public`                     | Public root. Created if missing.                                                                   |
| uploadDir       | string  | `<module>/public/files`               | Final destination directory. Created if missing.                                                   |
| uploadUrl       | string  | `/files/`                             | URL prefix used to build `UploadResult.url`. A trailing `/` is added automatically.                |
| maxPostSize     | integer | `11000000`                            | Maximum total bytes accepted on the XHR streaming path (≈ 110 MB).                                 |
| minFileSize     | integer | `1`                                   | Minimum bytes per file when `validate` is on.                                                      |
| maxFileSize     | integer | `10000000`                            | Maximum bytes per file when `validate` is on (≈ 100 MB).                                           |
| acceptFileTypes | RegExp  | `/.+/i`                               | Allow-list filename regex when `validate` is on.                                                   |
| imageTypes      | RegExp  | `/\.(gif\|jpe?g\|png)$/i`             | Filename regex used to decide whether GraphicsMagick should be invoked.                            |
| inlineFileTypes | RegExp  | `/\.(gif\|jpe?g\|png)$/i`             | Reserved for downstream consumers; not currently used by the middleware itself.                    |
| thumbSizes      | array   | `[[100, 100]]`                        | Thumbnail sizes. Each entry is either a single number (max dimension) or `[width, height]`.        |
| resize          | boolean | `false`                               | Resize image uploads to `newSize` while moving them.                                               |
| newSize         | tuple   | `[800, 600]`                          | Target `[width, height]` for `resize`. Pass only the first element to keep aspect ratio.           |
| crop            | boolean | `false`                               | Crop image uploads using `coordinates` while moving them.                                          |
| coordinates     | object  | `{ width:800, height:600, x:0, y:0 }` | Crop region (in pixels) for `crop`.                                                                |
| osSep           | string  | `path.sep`                            | _Deprecated._ Retained for backwards compatibility; paths now use Node's `path` module.            |

## In the Wild

The following projects use express-uploader.

If you are using express-uploader in a project, app, or module, get on the list below
by getting in touch or submitting a pull request with changes to the README.

## License

[MIT](LICENSE) © Aleksejs Gordejevs and contributors.
