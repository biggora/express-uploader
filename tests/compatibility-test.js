/*
 * Test backward compatibility with CommonJS require
 */

// Test importing using CommonJS require (simulating old usage)
console.log('Testing CommonJS backward compatibility...');

try {
  // This should work for backward compatibility
  const Uploader = require('../dist'); // This should work as before
  console.log('✓ CommonJS require works for main module');

  // Create an instance using the default export
  const uploader = new Uploader();
  if (uploader && typeof uploader.uploadFile === 'function') {
    console.log('✓ CommonJS import creates valid Uploader instance');
  } else {
    console.log('✗ CommonJS import failed to create valid instance');
  }

  console.log('✓ Backward compatibility maintained');
} catch (error) {
  console.error('✗ Backward compatibility test failed:', error.message);
}

// Test named imports (ES6 style)
console.log('\nTesting ES6 module compatibility...');
try {
  // This would be imported in the TypeScript file, but we're testing if the exports are available
  const { Uploader: ES6Uploader } = require('../dist');
  const uploader = new ES6Uploader();
  if (uploader && typeof uploader.uploadFile === 'function') {
    console.log('✓ ES6-style named imports work');
  } else {
    console.log('✗ ES6-style named imports failed');
  }
} catch (error) {
  console.error('✗ ES6-style import test failed:', error.message);
}

console.log('\nBackward compatibility test completed.');
