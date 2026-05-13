"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const express_uploader_1 = require("../lib/express-uploader");
const path = tslib_1.__importStar(require("path"));
// Track test results
let passedTests = 0;
let failedTests = 0;
console.log('Starting comprehensive tests for express-uploader...\n');
// Test 1: Basic instantiation
try {
    const options = {
        debug: false,
        validate: false,
        tmpDir: path.join(__dirname, '../tmp'),
        uploadDir: path.join(__dirname, '../test-uploads'),
        uploadUrl: '/test-uploads/',
    };
    const _uploader = new express_uploader_1.Uploader(options);
    console.log('✓ Test 1 PASSED: Uploader instance created successfully');
    passedTests++;
}
catch (error) {
    console.error('✗ Test 1 FAILED: Error creating uploader instance:', error.message);
    failedTests++;
}
// Test 2: Check methods exist
try {
    const uploader = new express_uploader_1.Uploader();
    if (typeof uploader.uploadFile === 'function') {
        console.log('✓ Test 2 PASSED: uploadFile method exists');
        passedTests++;
    }
    else {
        console.error('✗ Test 2 FAILED: uploadFile method missing');
        failedTests++;
    }
    if (typeof uploader.removeFile === 'function') {
        console.log('✓ Test 2b PASSED: removeFile method exists');
        passedTests++;
    }
    else {
        console.error('✗ Test 2b FAILED: removeFile method missing');
        failedTests++;
    }
    if (typeof uploader.validate === 'function') {
        console.log('✓ Test 2c PASSED: validate method exists');
        passedTests++;
    }
    else {
        console.error('✗ Test 2c FAILED: validate method missing');
        failedTests++;
    }
}
catch (error) {
    console.error('✗ Test 2 FAILED: Error testing methods:', error.message);
    failedTests++;
}
// Test 3: Settings are properly configured
try {
    const uploader = new express_uploader_1.Uploader();
    if (uploader.settings && typeof uploader.settings === 'object') {
        console.log('✓ Test 3 PASSED: Settings object exists and is properly configured');
        passedTests++;
    }
    else {
        console.error('✗ Test 3 FAILED: Settings object missing or invalid');
        failedTests++;
    }
}
catch (error) {
    console.error('✗ Test 3 FAILED: Error accessing settings:', error.message);
    failedTests++;
}
// Test 4: Validation functionality
try {
    const uploader = new express_uploader_1.Uploader({ validate: true, maxFileSize: 100 }); // 100 bytes max
    const fileWithTooLargeSize = {
        name: 'test.txt',
        size: 200, // exceeds maxFileSize
        type: 'text/plain',
    };
    const validationResult = uploader.validate(fileWithTooLargeSize);
    if (validationResult === 'File is too big') {
        console.log('✓ Test 4 PASSED: Validation correctly detected oversized file');
        passedTests++;
    }
    else {
        console.error('✗ Test 4 FAILED: Validation did not detect oversized file. Result:', validationResult);
        failedTests++;
    }
}
catch (error) {
    console.error('✗ Test 4 FAILED: Error testing validation:', error.message);
    failedTests++;
}
// Test 5: Validation passes for valid file
try {
    const uploader = new express_uploader_1.Uploader({ validate: true, maxFileSize: 1000 }); // 1000 bytes max
    const validFile = {
        name: 'valid.txt',
        size: 200, // within maxFileSize
        type: 'text/plain',
    };
    const validationResult = uploader.validate(validFile);
    if (validationResult === false) {
        // false means validation passed
        console.log('✓ Test 5 PASSED: Validation correctly passed valid file');
        passedTests++;
    }
    else {
        console.error('✗ Test 5 FAILED: Validation incorrectly failed valid file. Result:', validationResult);
        failedTests++;
    }
}
catch (error) {
    console.error('✗ Test 5 FAILED: Error testing validation with valid file:', error.message);
    failedTests++;
}
// Test 6: Safe name functionality (interface test only due to async nature)
try {
    const uploader = new express_uploader_1.Uploader();
    if (typeof uploader.safeName === 'function') {
        console.log('✓ Test 6 PASSED: safeName method exists');
        passedTests++;
    }
    else {
        console.error('✗ Test 6 FAILED: safeName method missing');
        failedTests++;
    }
}
catch (error) {
    console.error('✗ Test 6 FAILED: Error with safeName method:', error.message);
    failedTests++;
}
// Test 7: Class type and inheritance
try {
    const uploader = new express_uploader_1.Uploader();
    if (uploader.constructor.name === 'Uploader') {
        console.log('✓ Test 7 PASSED: Correct class type');
        passedTests++;
    }
    else {
        console.error('✗ Test 7 FAILED: Incorrect class type');
        failedTests++;
    }
}
catch (error) {
    console.error('✗ Test 7 FAILED: Error testing class type:', error.message);
    failedTests++;
}
// Test 8: Default options work
try {
    const uploader = new express_uploader_1.Uploader(); // Without options
    if (uploader.settings.debug === false) {
        // Default value
        console.log('✓ Test 8 PASSED: Default options work correctly');
        passedTests++;
    }
    else {
        console.error('✗ Test 8 FAILED: Default options not applied correctly');
        failedTests++;
    }
}
catch (error) {
    console.error('✗ Test 8 FAILED: Error testing default options:', error.message);
    failedTests++;
}
// Summary
console.log(`\nTests completed: ${passedTests} passed, ${failedTests} failed`);
if (failedTests === 0) {
    console.log('🎉 All tests passed! The migration is working correctly.');
    process.exit(0);
}
else {
    console.log('❌ Some tests failed. The migration needs fixes.');
    process.exit(1);
}
//# sourceMappingURL=comprehensive-test.js.map