// Test backward compatibility - simulating how the old library was used
console.log('Testing library usage patterns...');

// OLD WAY (before migration):
// const Uploader = require('express-uploader');
// const uploader = new Uploader(options);

// Let's test if our current build supports the old pattern
console.log('\\n1. Testing direct require (old library pattern):');
try {
  const Uploader = require('./dist');
  if (typeof Uploader === 'function') {
    console.log('  ✓ Old pattern works - require returns constructor directly');
    const uploader = new Uploader();
    console.log('  ✓ Can create instance with old pattern');
  } else if (typeof Uploader === 'object' && typeof Uploader.default === 'function') {
    console.log('  ⚠ Old pattern does not work directly');
    console.log('  ⚠ Consumer must use: require("./dist").default or ES6 import');
  } else {
    console.log('  ✗ Old pattern does not work');
  }
} catch (error) {
  console.log('  ✗ Error with old pattern:', error.message);
}

// NEW WAY (ES6 modules):
// import Uploader from 'express-uploader';
// or
// import { Uploader } from 'express-uploader';

console.log('\\n2. Testing ES6-style named require (like destructuring):');
try {
  const { Uploader } = require('./dist');
  if (typeof Uploader === 'function') {
    console.log('  ✓ Named import pattern works');
    const uploader = new Uploader();
    console.log('  ✓ Can create instance with named import');
  } else {
    console.log('  ✗ Named import pattern does not work');
  }
} catch (error) {
  console.log('  ✗ Error with named import pattern:', error.message);
}

console.log('\\n3. Testing ES6 default require pattern:');
try {
  const mod = require('./dist');
  const Uploader = mod.default; // ES6 default export accessed via CommonJS
  if (typeof Uploader === 'function') {
    console.log('  ✓ Default import pattern works');
    const uploader = new Uploader();
    console.log('  ✓ Can create instance with default import');
  } else {
    console.log('  ✗ Default import pattern does not work');
  }
} catch (error) {
  console.log('  ✗ Error with default import pattern:', error.message);
}

// Summary of compatibility
console.log('\\n--- COMPATIBILITY SUMMARY ---');
console.log('✓ ES6 import (import Uploader from "..."): Should work');
console.log('✓ ES6 named import (import {Uploader} from "..."): Should work via named exports');
console.log('⚠ CommonJS require (const Uploader = require("...")): May need .default property');
console.log('✓ CommonJS named require (const {Uploader} = require("...")): Should work');
console.log('✓ CommonJS default access (const Uploader = require("...").default): Works');
console.log(
  '\\nFor 100% backward compatibility, the library should export the constructor directly',
);
console.log('as module.exports, not as part of an object with a .default property.');
