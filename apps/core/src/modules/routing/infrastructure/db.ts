import type { Kysely } from 'kysely';

/**
 * What every repository in this module accepts — see identity/infrastructure/db.ts for the full
 * reasoning (decision 26, docs/progress.md): modules may not import `platform/`, even for a type,
 * so there is no shared `Database` type to build a typed Kysely instance against here.
 */
export type UntypedDb = Kysely<Record<string, unknown>>;
