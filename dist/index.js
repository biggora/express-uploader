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
 * copies of the Software, and to whom the Software is
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
Object.defineProperty(exports, '__esModule', { value: true });
exports.Uploader = void 0;
const express_uploader_1 = require('./lib/express-uploader');
Object.defineProperty(exports, 'Uploader', {
  enumerable: true,
  get: function () {
    return express_uploader_1.Uploader;
  },
});
// Export for ES6 modules
exports.default = express_uploader_1.Uploader;
const commonJsExport = express_uploader_1.Uploader;
commonJsExport.Uploader = express_uploader_1.Uploader;
commonJsExport.default = express_uploader_1.Uploader;
module.exports = commonJsExport;
//# sourceMappingURL=index.js.map
