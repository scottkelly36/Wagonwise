import type { Kysely } from 'kysely';

/** What every repository in this module accepts — see identity/infrastructure/db.ts for the reasoning (decision 26). */
export type UntypedDb = Kysely<Record<string, unknown>>;
