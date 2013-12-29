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

<table style="width:100%">
    <thead>
        <tr>
            <th>
                Name
            </th>
            <th>
                Type
            </th>
            <th>
                Default
            </th>
            <th>
                Description
            </th>
        </tr>
    </thead>
    <tr>
        <td>
            debug
        </td>
        <td>
            boolean
        </td>
        <td>
            false
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            safeName
        </td>
        <td>
            boolean
        </td>
        <td>
            true
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            validate
        </td>
        <td>
            boolean
        </td>
        <td>
            false
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            thumbnails
        </td>
        <td>
            boolean
        </td>
        <td>
            false
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            thumbToSubDir
        </td>
        <td>
            boolean
        </td>
        <td>
            false
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            tmpDir
        </td>
        <td>
            string
        </td>
        <td>
            `/tmp`
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            publicDir
        </td>
        <td>
            string
        </td>
        <td>
           `/public` 
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            uploadDir
        </td>
        <td>
            string
        </td>
        <td>
            `/public/files`
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            uploadUrl
        </td>
        <td>
            string
        </td>
        <td>
            `/files/`
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            maxPostSize
        </td>
        <td>
            integer
        </td>
        <td>
            11000000
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            minFileSize
        </td>
        <td>
            integer
        </td>
        <td>
            1
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            maxFileSize
        </td>
        <td>
            integer
        </td>
        <td>
            10000000
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            acceptFileTypes
        </td>
        <td>
            regexp
        </td>
        <td>
            `/.+/i`
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            thumbSizes
        </td>
        <td>
            array
        </td>
        <td>
            [[100, 100]]
        </td>
        <td>
            
        </td>
    </tr>
    <tr>
        <td>
            imageTypes
        </td>
        <td>
            regexp
        </td>
        <td>
            `/\.(gif|jpe?g|png)$/i`
        </td>
        <td>
            
        </td>
    </tr>
</table>

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