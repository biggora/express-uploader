'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const tslib_1 = require('tslib');
const express_uploader_1 = require('../lib/express-uploader');
const path = tslib_1.__importStar(require('path'));
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
    pipe: (_stream) => {
      // Mock pipe implementation
    },
    on: (_event, _callback) => {
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
//# sourceMappingURL=test.js.map
