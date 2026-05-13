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

## CI and release automation

GitHub Actions uses `.github/workflows/unit-tests.yml` for test automation. The
workflow runs on `push` and `pull_request`, installs dependencies with `npm ci`,
and then runs `npm run typecheck`, `npm run lint`, and `npm test` on Node.js 22
and 24.

Publishing is handled by `.github/workflows/publish.yml`. The publish workflow
runs only for pushed tags that match `v*`, uses the protected GitHub environment
named `npm-publish`, installs npm `^11.5.1`, runs `npm ci`, runs `npm test`,
checks package contents with `npm publish --dry-run`, and then runs
`npm publish`.

The npm publish path uses GitHub Actions OIDC Trusted Publishing. Do not add
`NODE_AUTH_TOKEN`, `NPM_TOKEN`, or a `registry-url` setting to this workflow.
Before the first release tag is pushed, configure npm Trusted Publishing for
package `express-uploader` with repository `biggora/express-uploader`, workflow
`.github/workflows/publish.yml`, and environment `npm-publish`.

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
            res.send(JSON.stringify(data), {'Content-Type': 'text/plain'}, 200);
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
    res.send(JSON.stringify(data), { 'Content-Type': 'text/plain' }, 200);
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

| Name            | Type    | Default                            | Description                                                                                  |
| --------------- | ------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| debug           | boolean | `false`                            | Enable verbose logging via `console.log`.                                                    |
| safeName        | boolean | `true`                             | Sanitize filenames and avoid collisions; disable to keep the originally provided name.       |
| validate        | boolean | `false`                            | Apply `minFileSize` / `maxFileSize` / `acceptFileTypes` checks before moving the file.       |
| quality         | number  | `80`                               | JPEG quality (0–100) used when resizing/cropping via GraphicsMagick.                         |
| thumbnails      | boolean | `false`                            | Generate thumbnails for image uploads.                                                       |
| thumbToSubDir   | boolean | `false`                            | When `true`, thumbnails go to `uploadDir/<WxH>/<name>`; otherwise to `uploadDir/thumb_..._<name>`. |
| tmpDir          | string  | `<module>/tmp`                     | Temp directory for incoming uploads. Created if missing.                                     |
| publicDir       | string  | `<module>/public`                  | Public root. Created if missing.                                                             |
| uploadDir       | string  | `<module>/public/files`            | Final destination directory. Created if missing.                                             |
| uploadUrl       | string  | `/files/`                          | URL prefix used to build `UploadResult.url`. A trailing `/` is added automatically.          |
| maxPostSize     | integer | `11000000`                         | Maximum total bytes accepted on the XHR streaming path (≈ 110 MB).                           |
| minFileSize     | integer | `1`                                | Minimum bytes per file when `validate` is on.                                                |
| maxFileSize     | integer | `10000000`                         | Maximum bytes per file when `validate` is on (≈ 100 MB).                                     |
| acceptFileTypes | RegExp  | `/.+/i`                            | Allow-list filename regex when `validate` is on.                                             |
| imageTypes      | RegExp  | `/\.(gif\|jpe?g\|png)$/i`          | Filename regex used to decide whether GraphicsMagick should be invoked.                      |
| inlineFileTypes | RegExp  | `/\.(gif\|jpe?g\|png)$/i`          | Reserved for downstream consumers; not currently used by the middleware itself.              |
| thumbSizes      | array   | `[[100, 100]]`                     | Thumbnail sizes. Each entry is either a single number (max dimension) or `[width, height]`.  |
| resize          | boolean | `false`                            | Resize image uploads to `newSize` while moving them.                                         |
| newSize         | tuple   | `[800, 600]`                       | Target `[width, height]` for `resize`. Pass only the first element to keep aspect ratio.     |
| crop            | boolean | `false`                            | Crop image uploads using `coordinates` while moving them.                                    |
| coordinates     | object  | `{ width:800, height:600, x:0, y:0 }` | Crop region (in pixels) for `crop`.                                                       |
| osSep           | string  | `path.sep`                         | _Deprecated._ Retained for backwards compatibility; paths now use Node's `path` module.      |

## In the Wild

The following projects use express-uploader.

If you are using express-uploader in a project, app, or module, get on the list below
by getting in touch or submitting a pull request with changes to the README.

## Author

Aleksej Gordejev (aleksej@gordejev.lv).

## License

(The MIT License)

Copyright (c) 2012 Aleksej Gordejev <aleksej@gordejev.lv>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Resources

- Visit the [author website](http://www.gordejev.lv).
- Follow [@biggora](https://twitter.com/#!/biggora) on Twitter for updates.
- Report issues on the [github issues](https://github.com/biggora/express-uploader/issues) page.

[![Analytics](https://ga-beacon.appspot.com/UA-22788134-5/express-uploader/readme)](https://github.com/igrigorik/ga-beacon)

[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/biggora/express-uploader/trend.png)](https://bitdeli.com/free 'Bitdeli Badge')
