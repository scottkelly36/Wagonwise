import { baseConfig } from '@wagonwise/config/eslint';

export default [
  ...baseConfig,
  // Fixtures intentionally violate the architecture rules and are never compiled.
  { ignores: ['fixtures/**'] },
];
