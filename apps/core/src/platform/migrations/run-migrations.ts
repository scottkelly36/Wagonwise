import { readdirSync, readFileSync } from 'node:fs';
import type { Pool } from 'pg';

export interface MigrationResult {
  readonly applied: readonly string[];
}

/**
 * Applies every `*.sql` file in `migrationsDir` not already recorded in
 * `public.schema_migrations`, in filename order — hence the zero-padded numeric prefix
 * (`0001_init.sql`, `0002_...`, ...) rather than a timestamp, so the order is obvious on sight.
 *
 * Each file runs in its own transaction: a bad statement rolls back that file's DDL and leaves
 * it unrecorded, so fixing the file and re-running picks it back up rather than half-applying it
 * forever. Multi-statement files work because a bare `client.query(text)` with no parameters
 * uses Postgres's simple query protocol, which runs a `;`-separated batch as one round trip.
 *
 * Fails closed: an unreadable migrations directory or a query error stops the process instead
 * of silently skipping a migration (the same convention `packages/architecture` uses).
 */
export async function runMigrations(pool: Pool, migrationsDir: string): Promise<MigrationResult> {
  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const { rows } = await client.query<{ id: string }>('select id from public.schema_migrations');
    const alreadyApplied = new Set(rows.map((row) => row.id));

    const applied: string[] = [];
    for (const file of files) {
      if (alreadyApplied.has(file)) {
        continue;
      }
      const sql = readFileSync(`${migrationsDir}/${file}`, 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public.schema_migrations (id) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`migration ${file} failed, rolled back: ${(error as Error).message}`, {
          cause: error,
        });
      }
      applied.push(file);
    }
    return { applied };
  } finally {
    client.release();
  }
}
