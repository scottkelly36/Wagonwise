// Runs the architecture rules against the real source in apps/*/src.
// The fixtures are covered separately by `pnpm test`; this is the check that gates CI.
//
// Scoped to src/ on purpose: package-root files (eslint.config.js, vitest.config.ts) are
// tooling, not architecture, and following them drags in unrelated packages.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const config = fileURLToPath(new URL('../dependency-cruiser.config.cjs', import.meta.url));
const cruiser = fileURLToPath(
  new URL('../node_modules/dependency-cruiser/bin/dependency-cruise.mjs', import.meta.url),
);

const appsDir = `${root}apps`;
const targets = existsSync(appsDir)
  ? readdirSync(appsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(`${appsDir}/${entry.name}/src`))
      .map((entry) => `apps/${entry.name}/src`)
  : [];

if (targets.length === 0) {
  // Loud on purpose: a silent pass would look like enforcement that isn't happening.
  console.log('architecture: no apps/*/src directories yet — nothing to check.');
  process.exit(0);
}

console.log(`architecture: checking ${targets.join(', ')}`);
const result = spawnSync(
  process.execPath,
  [cruiser, '--config', config, '--output-type', 'err-long', ...targets],
  { stdio: 'inherit', cwd: root },
);

process.exit(result.status ?? 1);
