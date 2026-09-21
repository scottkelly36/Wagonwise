import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Fixtures are deliberately broken code; never collect them as tests.
    exclude: ['fixtures/**', 'node_modules/**'],
  },
});
