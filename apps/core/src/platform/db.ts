import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

/**
 * `platform/`'s own Kysely schema — empty, since platform owns no tables of its own; it exists
 * so `PostgresUnitOfWork` has a concrete type to open transactions against. Deliberately NOT
 * shared with modules: a module's `infrastructure/` may not import `platform/` at all, even for
 * a type (AGENTS.md rule "modules-no-outward" — found and corrected during M1.5, see decision 26
 * in docs/progress.md), so each module's repositories use `Kysely<Record<string, unknown>>`
 * instead of a typed `Database` and query with raw `sql` tagged templates. Migrations
 * (`../migrations/`) are raw SQL either way and know nothing of this type.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- deliberately empty, see above.
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
