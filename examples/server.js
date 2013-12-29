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

var express = require('express'),
        Uploader = require('../lib/express-uploader'),
        app = express();

// Settings
var settings = {
    node_port: process.argv[2] || 3000,
    uploadpath: __dirname + '/uploads/'
};

// Configuration
app.configure(function() {
    // We need the bodyParser to form parsing old style uploads
    app.use(express.bodyParser({
        uploadDir: '../uploads',
        keepExtensions: true,
        encoding: 'utf8'
    }));
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express['static'](__dirname));
});

/*
 * Display upload form
 */
app.all('/',function (req, res) {
    res.sendHeader(200, {"Content-Type": "text/html"});
    res.sendBody(
        '<form action="/upload" method="post" enctype="multipart/form-data">'+
        '<input type="file" name="upload-file">'+
        '<input type="submit" value="Upload">'+
        '</form>'
    );
    res.finish();
});

/*
 * Route that takes the post upload request and sends the server response
 */
app.all('/upload', function(req, res, next) {
    var uploader = new Uploader({
        validate: true,
        tmpDir: __dirname + '/tmp',
        publicDir: __dirname + '/public',
        uploadDir: __dirname + '/public/files',
        uploadUrl: '/getid/',
        thumbSizes: [140,[100, 100]]
    });

    uploader.uploadFile(req, function(data) {
        res.send(JSON.stringify(data), {'Content-Type': 'text/plain'}, 200);
    });
});

app.listen(3000, '127.0.0.1');
console.log("Express server listening on %s:%d for uploads", '127.0.0.1', 3000);