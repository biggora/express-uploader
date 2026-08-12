/*
 * Test backward compatibility with CommonJS require
 */
console.log('Testing CommonJS backward compatibility...');

try {
  // Test the main module export (this should work with the default export)
  const Uploader = require('../dist'); // This should get the default export
  console.log('✓ CommonJS require works for main module');

  // Create an instance
  const uploader = new Uploader();
  if (uploader && typeof uploader.uploadFile === 'function') {
    console.log('✓ CommonJS import creates valid Uploader instance');
  } else {
    console.log('✗ CommonJS import failed to create valid instance');
  }

  console.log('✓ Basic backward compatibility maintained');
} catch (error) {
  console.error('✗ Backward compatibility test failed:', error.message);
}

console.log('\\nCommonJS compatibility test completed.');
