// Runs the architecture rules against the real code in apps/.
// The fixtures are covered separately by `pnpm test`; this is the check that gates CI.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const config = fileURLToPath(new URL('../dependency-cruiser.config.cjs', import.meta.url));
const target = `${root}apps`;

if (!existsSync(`${root}apps/core/src`)) {
  // Loud on purpose: a silent pass would look like enforcement that isn't happening.
  console.log(
    'architecture: apps/core/src does not exist yet (arrives in M1.3) — nothing to check.',
  );
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/dependency-cruiser/bin/dependency-cruise.mjs', import.meta.url),
    ),
    '--config',
    config,
    '--output-type',
    'err-long',
    target,
  ],
  { stdio: 'inherit', cwd: root },
);

process.exit(result.status ?? 1);
