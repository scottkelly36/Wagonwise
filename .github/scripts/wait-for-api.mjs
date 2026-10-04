// Command-line wrapper for api-checks.mjs: waits (up to WAIT_MINUTES, default 20) for the live server
// to answer every check in .github/release/api-checks.txt. Exits 1, publishing nothing, if it never does.
import { readFileSync } from 'node:fs';

import { parseChecks, waitForChecks } from './api-checks.mjs';

const base = process.env.API_BASE ?? 'https://api.wagon-wise.co.uk';
const checks = parseChecks(
  readFileSync(new URL('../release/api-checks.txt', import.meta.url), 'utf8'),
);

const failing = await waitForChecks(base, checks, {
  timeoutMs: Number(process.env.WAIT_MINUTES ?? 20) * 60_000,
  intervalMs: 30_000,
});

if (failing.length > 0) {
  console.error('The live server does not have what this app needs yet:');
  for (const { check, got } of failing) {
    console.error(`  ${check.method} ${check.path}: got ${got}, wanted ${check.status}`);
  }
  console.error('Nothing was published. Re-run the workflow once the server has deployed.');
  process.exit(1);
}
console.log(`All ${checks.length} server checks pass against ${base}.`);
