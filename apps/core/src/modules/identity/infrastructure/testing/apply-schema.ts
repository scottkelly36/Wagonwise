import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const migrationsDir = fileURLToPath(new URL('../../../../../migrations', import.meta.url));

/**
 * Test-only: applies this repo's migrations to a fresh Testcontainers instance. Duplicates
 * (rather than imports) platform/migrations/run-migrations.ts's "read a .sql file, run it" step
 * — modules may not import platform/, even from a test file (AGENTS.md rule "modules-no-outward"
 * has no test-file exemption, unlike the domain npm-purity rule). No tracking table needed here:
 * every container starts empty, so there is nothing to skip.
 */
export async function applySchema(pool: Pool): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(`${migrationsDir}/${file}`, 'utf8');
    await pool.query(sqlText);
  }
}
