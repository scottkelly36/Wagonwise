const jestExpoPreset = require('jest-expo/jest-preset');

// jose (src/lib/jwt.ts) ships ESM-only (its own package.json exports have no CJS "require"
// condition), so Jest's CJS require() can load the file but can't execute its raw `import`
// syntax — it needs babel-jest to transpile it, same as our own source. jest-expo's default
// transformIgnorePatterns already carves out react-native/expo packages for exactly this
// reason; jose just isn't on that list, so it's added here rather than replacing the whole
// pattern (confirmed by actually running the test suite, not guessed: without this, jest fails
// with "Cannot use import statement outside a module" pointing straight at jose's dist file).
const [firstIgnorePattern, ...restIgnorePatterns] = jestExpoPreset.transformIgnorePatterns;

/** @type {import('jest').Config} */
module.exports = {
  ...jestExpoPreset,
  transformIgnorePatterns: [firstIgnorePattern.replace(')', '|jose)'), ...restIgnorePatterns],
};
