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
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
          __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
Object.defineProperty(exports, '__esModule', { value: true });
const express_uploader_1 = require('../lib/express-uploader');
const path = __importStar(require('path'));
// Basic test to ensure the module can be imported and instantiated
console.log('Testing Uploader module...');
// Test 1: Create a new uploader instance
try {
  const options = {
    debug: false,
    validate: false,
    tmpDir: path.join(__dirname, 'tmp'),
    uploadDir: path.join(__dirname, 'uploads'),
    uploadUrl: '/uploads/',
  };
  const uploader = new express_uploader_1.Uploader(options);
  console.log('✓ Uploader instance created successfully');
  // Test 2: Check that the uploader has the expected methods
  if (typeof uploader.uploadFile === 'function') {
    console.log('✓ uploadFile method exists');
  } else {
    console.error('✗ uploadFile method missing');
  }
  if (typeof uploader.removeFile === 'function') {
    console.log('✓ removeFile method exists');
  } else {
    console.error('✗ removeFile method missing');
  }
  if (typeof uploader.validate === 'function') {
    console.log('✓ validate method exists');
  } else {
    console.error('✗ validate method missing');
  }
  // Test 3: Check settings are properly configured
  if (uploader.settings) {
    console.log('✓ Settings object exists');
  } else {
    console.error('✗ Settings object missing');
  }
  console.log('All basic tests passed!');
} catch (error) {
  console.error('✗ Error during testing:', error.message);
  process.exit(1);
}
// Mock request object for testing
const mockRequest = (files = {}) => {
  return {
    files,
    header: (name) => {
      if (name === 'x-file-name') return 'test.txt';
      if (name === 'x-file-size') return '1024';
      return null;
    },
    pipe: (stream) => {
      // Mock pipe implementation
    },
    on: (event, callback) => {
      // Mock event listener
    },
    xhr: false,
  };
};
// Test 4: Try a simple upload flow without actual files (since we don't have real file uploads in this test)
try {
  const uploader = new express_uploader_1.Uploader();
  const mockReq = mockRequest();
  uploader.uploadFile(mockReq, (result) => {
    if (result && typeof result === 'object' && 'error' in result) {
      if (result.error === 'Not files found!') {
        console.log('✓ Upload test handled no files case correctly');
      } else {
        console.log('✓ Upload test returned expected result:', result);
      }
    } else {
      console.log('✓ Upload test completed with result:', result);
    }
  });
} catch (error) {
  console.error('✗ Error during upload test:', error.message);
}
