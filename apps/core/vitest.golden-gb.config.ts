import { defineConfig } from 'vitest/config';

/**
 * Golden routes for the whole of Great Britain, against the live national Valhalla through an SSH tunnel (see the test file).
 * Run by hand, never in `pnpm test`, `pnpm verify` or the nightly workflow. Its own file suffix (`*.golden-gb-test.ts`), so
 * neither `vitest.config.ts` nor `vitest.golden.config.ts` can pick it up.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.golden-gb-test.ts'],
    testTimeout: 120_000,
  },
});
