import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

/**
 * The application-wide Kysely schema. Empty for now — no module owns a typed table yet.
 * Each module's `infrastructure/` augments this as its tables land (identity in M1.5), so a
 * repository gets compile-time column checking against the same schema every other module sees.
 * Migrations (`../migrations/`) are raw SQL and know nothing of this type; it exists purely for
 * the query builder.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- extended per-module, not here.
export interface Database {}

/**
 * One pool per process, created here and nowhere else, so every adapter shares the same
 * connection limit. `composition/` owns its lifetime (creates it once, closes it on shutdown).
 */
export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export function createDb(pool: Pool): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
