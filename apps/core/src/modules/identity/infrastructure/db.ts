import type { Kysely } from 'kysely';

/**
 * What every repository in this module accepts: "a Kysely instance", with no opinion on its
 * table types. There is no shared, app-wide `Database` type available here — modules may not
 * import `platform/` (AGENTS.md rule "modules-no-outward"), even for a type — so each repository
 * uses raw `sql` tagged-template queries instead of Kysely's typed query builder (decision 26,
 * docs/progress.md). `Record<string, unknown>` rather than `any`: precise enough to satisfy
 * `no-explicit-any`, and correct — this really is "a database whose shape I am not typing."
 */
export type UntypedDb = Kysely<Record<string, unknown>>;
