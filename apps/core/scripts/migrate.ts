// The `pnpm db:migrate` CLI entry point. Run via tsx (`tsx scripts/migrate.ts`), same as
// `pnpm dev` runs src/main.ts — no build step needed for either.
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from '../src/config.js';
import { createPool } from '../src/platform/db.js';
import { runMigrations } from '../src/platform/migrations/run-migrations.js';

function bootConfig() {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
const config = bootConfig();
const pool = createPool(config.databaseUrl);

try {
  const { applied } = await runMigrations(pool, migrationsDir);
  if (applied.length === 0) {
    console.log('migrate: already up to date');
  } else {
    console.log(`migrate: applied ${applied.length} migration(s):`);
    for (const file of applied) {
      console.log(`  - ${file}`);
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
