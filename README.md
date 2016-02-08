## File uploader

Uploading files middleware for NodeJS, Express, TrinteJS, Connect.

## Installation

Installation is done using the Node Package Manager (npm). If you don't have npm installed on your system you can download it from [npmjs.org](http://npmjs.org/)
To install express-uploader:

    $ npm install -g express-uploader

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

app.all('/upload', function(req, res, next) {
    var uploader = new Uploader({
        debug: true,
        validate: true,
        thumbnails: true,
        thumbToSubDir: true,
        tmpDir: __dirname + '/tmp',
        publicDir: __dirname + '/public',
        uploadDir: __dirname + '/public/files',
        uploadUrl: '/files/',
        thumbSizes: [140,[100, 100]]
    });
    uploader.uploadFile(req, function(data) {
        res.send(JSON.stringify(data), {'Content-Type': 'text/plain'}, 200);
    });
});

```

Options
-----------------

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| debug | boolean | false |
| safeName | boolean | true |
| validate | boolean | false |
| quality | number | 80 |
| thumbnails | boolean | false |
| thumbToSubDir | boolean | false |
| tmpDir | string | `/tmp` |
| publicDir | string | `/public` |
| uploadDir | string | `/public/files` |
| uploadUrl | string | `/files/` |
| maxPostSize | integer | 11000000 |
| minFileSize | integer | 1 |
| maxFileSize | integer | 10000000 |
| acceptFileTypes | regexp | `/.+/i` |
| thumbSizes | array | [[100, 100]] | [width, neight] |
| imageTypes | regexp | `/\.(gif|jpe?g|png)$/i` |
| resize | boolean | false | if need resize image |
| newSize | mixed | `[800, 600]` | new size for image [width, height] |
| crop | boolean | false | if need crop image |
| coordinates | object | `{width:800,height:600,x:0,y:0}` | coordinates for crop image { width:1200, height:800, x:0, y:0 } |

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

### Startups & Apps

- [TViMama](http://tvimama.com/)
- [GorkaTV](https://gorkatv.com/)
- [TrinteJS](http://www.trintejs.com/)
- [CaminteJS](http://www.camintejs.com/)

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

[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/biggora/express-uploader/trend.png)](https://bitdeli.com/free "Bitdeli Badge")

