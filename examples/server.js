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

var fs = require('fs');
var express = require('express');
var multiparty = require('connect-multiparty');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var Uploader = require('../lib/express-uploader');
var app = express();

// Configuration

app.use(morgan('dev'));
// We need the bodyParser to form parsing old style uploads
app.use(multiparty({
    uploadDir: __dirname + '/tmp',
    keepExtensions: true,
    encoding: 'utf8'
}));
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}));
// parse application/json
app.use(bodyParser.json());
// parse application/vnd.api+json as json
app.use(bodyParser.json({type: 'application/vnd.api+json'}));
app.use(methodOverride('X-HTTP-Method'));              // Microsoft
app.use(methodOverride('X-HTTP-Method-Override'));     // Google/GData
app.use(methodOverride('X-Method-Override'));          // IBM
app.use(methodOverride('_method')); 	           // simulate DELETE and PUT
app.use(methodOverride(function(req, res) {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
        // look in urlencoded POST bodies and delete it
        var method = req.body._method;
        delete req.body._method;
        return method;
    }
}));
app.use(cookieParser('weritas10'));


/*
 * Display upload form
 */
app.all('/', function(req, res) {
    res.send(
            '<form action="/upload" method="post" enctype="multipart/form-data">' +
            '  <input type="file" name="upload-file"  multiple="true">' +
            '  <input type="submit" value="Upload">' +
            '</form>'
            );
});

/*
 * Route that takes the post upload request and sends the server response
 */
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
        thumbSizes: [140, [100, 100]]
    });

    uploader.uploadFile(req, function(data) {
        res.send(JSON.stringify(data), {'Content-Type': 'text/plain'}, 200);
    });
});

// Create tmp dir
if (!fs.existsSync(__dirname + '/tmp')) {
    fs.mkdirSync(__dirname + '/tmp', 0755);
}

app.listen(3000, '127.0.0.1');
console.log("Express server listening on %s:%d for uploads", '127.0.0.1', 3000);