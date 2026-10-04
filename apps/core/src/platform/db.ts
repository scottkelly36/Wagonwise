import { Kysely, PostgresDialect, type PostgresPool } from 'kysely';
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
  const pool = new Pool({ connectionString: databaseUrl });
  attachPoolErrorHandler(pool);
  return pool;
}

function logPoolError(error: Error): void {
  console.error(`database pool: an idle connection failed (${error.message}); it will be replaced`);
}

/**
 * node-postgres re-emits an error on an idle connection (the server restarted, a network blip, a
 * managed database's maintenance) as an 'error' event on the pool. With no listener Node treats
 * that as an uncaught exception and the whole process dies, so every pool needs one. The pool
 * drops the dead connection and opens a new one on the next query, so logging is all that is left
 * to do. Errors on a query in flight are not affected: those still reject that query.
 */
export function attachPoolErrorHandler(
  pool: Pool,
  onError: (error: Error) => void = logPoolError,
): void {
  pool.on('error', onError);
}

/** `pool` is usually `PostgresDataScopes.pool`, so queries inside a scope join its transaction. */
export function createDb(pool: PostgresPool): Kysely<Database> {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
