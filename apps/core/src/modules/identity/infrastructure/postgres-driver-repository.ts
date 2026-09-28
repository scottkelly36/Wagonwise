import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { Transaction } from '../../../shared/ports/unit-of-work.js';
import type { DriverRepository } from '../application/ports/driver-repository.js';
import type { Driver, DriverId, DriverScope } from '../domain/driver.js';
import type { UntypedDb } from './db.js';

interface DriverRow {
  readonly id: string;
  readonly identifier: string;
  readonly created_at: Date;
  readonly consented_at: Date | null;
  readonly deleted_at: Date | null;
  readonly is_admin: boolean;
  readonly company_id: string | null;
  readonly scopes: DriverScope[];
}

function toDomain(row: DriverRow): Driver {
  return {
    id: makeId<'DriverId'>(row.id),
    identifier: row.identifier,
    createdAt: row.created_at,
    consentedAt: row.consented_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    isAdmin: row.is_admin,
    companyId: row.company_id === null ? undefined : makeId<'CompanyId'>(row.company_id),
    scopes: row.scopes,
  };
}

const SELECT_COLUMNS = `
  id, identifier, created_at, consented_at, deleted_at, is_admin, company_id, scopes
`;

/**
 * Raw `sql` tagged-template queries, not Kysely's typed query builder — modules may not import
 * `platform/` (AGENTS.md rule "modules-no-outward"), so there is no shared, app-wide `Database`
 * type available here to build against (decision 26 in docs/progress.md). Still "Kysely for
 * queries" (decision 12): it gives safe parameter binding, just without per-table typing this
 * module cannot have without that import.
 */
export class PostgresDriverRepository implements DriverRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByIdentifier(identifier: string): Promise<Driver | null> {
    const { rows } = await sql<DriverRow>`
      select ${sql.raw(SELECT_COLUMNS)} from identity.drivers where identifier = ${identifier}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findById(id: DriverId): Promise<Driver | null> {
    const { rows } = await sql<DriverRow>`
      select ${sql.raw(SELECT_COLUMNS)} from identity.drivers where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findAll(): Promise<Driver[]> {
    const { rows } = await sql<DriverRow>`
      select ${sql.raw(SELECT_COLUMNS)} from identity.drivers order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  /** Upsert (the port's contract, M8) — `consent()`/`anonymize()` re-save an existing row, and
   *  now so does `update-driver.ts`'s admin action (2026-09-27). `is_admin`/`company_id` used to
   *  be deliberately excluded from `excluded` here, back when there was no sanctioned way to set
   *  either — only a direct database edit. Now that a real, admin-gated use case exists, this is
   *  the one legitimate path for both to change, so they're included like every other field. */
  async save(driver: Driver, tx?: Transaction): Promise<void> {
    const executor = tx ? (tx as unknown as UntypedDb) : this.db;
    await sql`
      insert into identity.drivers
        (id, identifier, created_at, consented_at, deleted_at, is_admin, company_id, scopes)
      values (
        ${driver.id}, ${driver.identifier}, ${driver.createdAt},
        ${driver.consentedAt ?? null}, ${driver.deletedAt ?? null}, ${driver.isAdmin},
        ${driver.companyId ?? null}, ${JSON.stringify(driver.scopes)}
      )
      on conflict (id) do update set
        identifier = excluded.identifier,
        consented_at = excluded.consented_at,
        deleted_at = excluded.deleted_at,
        is_admin = excluded.is_admin,
        company_id = excluded.company_id,
        scopes = excluded.scopes
    `.execute(executor);
  }
}
