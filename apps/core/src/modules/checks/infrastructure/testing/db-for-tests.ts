import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { UntypedDb } from '../db.js';

/** Test-only: duplicates platform/db.ts's two trivial factories — see identity's own copy for why
 *  modules can't import platform/, even from a test file. */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export function createDb(pool: Pool): UntypedDb {
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}
