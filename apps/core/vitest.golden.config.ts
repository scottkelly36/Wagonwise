import { defineConfig } from 'vitest/config';

/**
 * Golden-route tests only: real requests against a real, tile-built Valhalla instance (decision
 * 13, docs/progress.md — nightly and on map rebuild, never per-PR, since building tiles takes
 * minutes). Separate config, separate file suffix (`*.golden-test.ts`, not `*.test.ts`) so
 * `vitest.config.ts`'s own include pattern can't accidentally pick these up into `pnpm test`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.golden-test.ts'],
    testTimeout: 30_000,
  },
});
