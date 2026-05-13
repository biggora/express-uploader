// Test how the old code would have been used vs new
console.log('Testing compatibility scenarios...');

// Scenario 1: Old way (this would have worked before migration)
// const Uploader = require('express-uploader');
// const uploader = new Uploader(options);

// With our current implementation (CommonJS consumer):
const mod = require('./dist'); // This returns an object
const Uploader = mod.default; // We need to access .default

console.log('✓ Can access Uploader via require("./dist").default');

// Test instantiation
const uploader = new Uploader({ debug: false });
console.log('✓ Can create Uploader instance from .default property');

// Scenario 2: If we want true backward compatibility, we'd need:
// module.exports = Uploader;  // directly, not as an object with .default

// This is actually a common pattern in modern libraries that support both ES and CommonJS.
console.log('\\nNote: This is the standard approach for dual ES/CommonJS module support.');
console.log(
  'Consumers using CommonJS will need to use: const Uploader = require("./dist").default',
);
console.log('Or use destructuring: const { default: Uploader } = require("./dist");');

// The alternative would be to use the old style CommonJS module.exports
console.log('\\nFor 100% backward compatibility, we could provide a separate CommonJS entry.');
