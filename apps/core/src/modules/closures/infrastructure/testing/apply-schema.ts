import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const migrationsDir = fileURLToPath(new URL('../../../../../migrations', import.meta.url));

/** Test-only: applies this repo's migrations to a fresh Testcontainers instance. Duplicated from
 *  every other module's own copy rather than shared — see identity's apply-schema.ts for why
 *  modules can't import platform/'s real migration runner even in tests. */
export async function applySchema(pool: Pool): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(`${migrationsDir}/${file}`, 'utf8');
    await pool.query(sqlText);
  }
}
