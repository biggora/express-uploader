[![npm version](https://img.shields.io/npm/v/express-uploader.svg)](https://www.npmjs.com/package/express-uploader)
[![CI](https://img.shields.io/github/actions/workflow/status/biggora/express-uploader/ci.yml?branch=master)](https://github.com/biggora/express-uploader/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## File uploader

Uploading files middleware for NodeJS, Express, TrinteJS, Connect.

## Installation

Installation is done using the Node Package Manager (npm). If you don't have npm installed on your system you can download it from [npmjs.org](http://npmjs.org/)
To install express-uploader:

    $ npm install -g express-uploader

## Development

For development, after cloning the repository, install dependencies and run the
test suite:

    $ npm ci
    $ npm test

The default test command runs `vitest run`.

Useful maintainer commands:

    $ npm run build
    $ npm run test:legacy
    $ npm run test:comprehensive
    $ npm run lint
    $ npm run typecheck

## CI and release automation

GitHub Actions uses `.github/workflows/unit-tests.yml` for test automation. The
workflow runs on `push` and `pull_request`, installs dependencies with `npm ci`,
and runs `npm test` on Node.js 22 and 24.

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

### Callback result shape

The shape of `data` depends on how the upload arrived:

- **Form upload** (`req.files` populated by a multipart parser such as `multer`) — `data` is `UploadResult[]`, one entry per file. Use `Array.isArray(data)` to detect this branch.
- **XHR streaming upload** (`req.xhr === true`, `x-file-name` / `x-file-size` headers) — `data` is a single `UploadResult` object. On invalid headers or stream errors, it carries `success: false` and an `error` message.
- **Empty request** (no files attached) — `data` is a single synthetic `UploadResult` with `error: 'Not files found!'`.

## Options

| Name            | Type    | Default                          | Description                                                     |
| --------------- | ------- | -------------------------------- | --------------------------------------------------------------- | -------- |
| debug           | boolean | false                            |
| safeName        | boolean | true                             |
| validate        | boolean | false                            |
| quality         | number  | 80                               |
| thumbnails      | boolean | false                            |
| thumbToSubDir   | boolean | false                            |
| tmpDir          | string  | `/tmp`                           |
| publicDir       | string  | `/public`                        |
| uploadDir       | string  | `/public/files`                  |
| uploadUrl       | string  | `/files/`                        |
| maxPostSize     | integer | 11000000                         |
| minFileSize     | integer | 1                                |
| maxFileSize     | integer | 10000000                         |
| acceptFileTypes | regexp  | `/.+/i`                          |
| thumbSizes      | array   | [[100, 100]]                     | [width, neight]                                                 |
| imageTypes      | regexp  | `/\.(gif                         | jpe?g                                                           | png)$/i` |
| resize          | boolean | false                            | if need resize image                                            |
| newSize         | mixed   | `[800, 600]`                     | new size for image [width, height]                              |
| crop            | boolean | false                            | if need crop image                                              |
| coordinates     | object  | `{width:800,height:600,x:0,y:0}` | coordinates for crop image { width:1200, height:800, x:0, y:0 } |

## In the Wild

The following projects use express-uploader.

If you are using express-uploader in a project, app, or module, get on the list below
by getting in touch or submitting a pull request with changes to the README.

### Recommend extensions

- [Bootstrap Fancy File Plugin](http://biggora.github.io/bootstrap-fancyfile/)
- [Bootstrap Ajax Typeahead Plugin](https://github.com/biggora/bootstrap-ajax-typeahead)
- [TrinteJS - Javascrpt MVC Framework for Node.JS](http://www.trintejs.com/)
- [CaminteJS - Cross-db ORM for NodeJS](http://www.camintejs.com/)
- [MongoDB Session Storage for ExpressJS](https://github.com/biggora/express-mongodb)
- [2CO NodeJS adapter for 2checkout API payment gateway](https://github.com/biggora/2co)

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
