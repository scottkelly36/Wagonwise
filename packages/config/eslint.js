import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config for every TypeScript package in the monorepo.
 *
 * Architectural boundaries (clean-architecture layering, module facades) are not
 * enforced here — dependency-cruiser owns those, see M1.2.
 */
export const baseConfig = tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**'],
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Expected failures are Result values (CLAUDE.md rule 13); floating promises
      // and unsafe any would let real failures pass silently.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
);

export default baseConfig;
