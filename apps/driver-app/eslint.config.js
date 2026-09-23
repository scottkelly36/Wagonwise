// Expo's own preset, not @wagonwise/config/eslint — that config's TS rules assume
// module: NodeNext (rule enforced repo-wide for apps/core and apps/driver-bff), which
// fights Metro's bundler-style resolution. React Native code here is bundled by Metro,
// never run by plain node, so the "well-understood official preset" is the boring
// choice, the same reasoning M4.1 used for jose over hand-rolled JWKS handling.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/**', '.expo/**', 'android/**', 'ios/**'],
  },
];
