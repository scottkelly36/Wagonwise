import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { Transaction } from '../../../shared/ports/unit-of-work.js';
import type { DriverRepository } from '../application/ports/driver-repository.js';
import type { Driver, DriverId } from '../domain/driver.js';
import type { UntypedDb } from './db.js';

interface DriverRow {
  readonly id: string;
  readonly identifier: string;
  readonly created_at: Date;
  readonly consented_at: Date | null;
  readonly deleted_at: Date | null;
  readonly is_admin: boolean;
}

function toDomain(row: DriverRow): Driver {
  return {
    id: makeId<'DriverId'>(row.id),
    identifier: row.identifier,
    createdAt: row.created_at,
    consentedAt: row.consented_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    isAdmin: row.is_admin,
  };
}

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
      select id, identifier, created_at, consented_at, deleted_at, is_admin
      from identity.drivers where identifier = ${identifier}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findById(id: DriverId): Promise<Driver | null> {
    const { rows } = await sql<DriverRow>`
      select id, identifier, created_at, consented_at, deleted_at, is_admin
      from identity.drivers where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Upsert (the port's contract, M8) — `consent()`/`anonymize()` re-save an existing row.
   *  `is_admin` is never part of `excluded` on conflict — this repository is not how a driver
   *  becomes an admin (there's no domain function that sets `isAdmin: true`), so a re-save must
   *  never clobber a flag set directly in the database back to whatever the in-memory `Driver`
   *  happened to be constructed with. */
  async save(driver: Driver, tx?: Transaction): Promise<void> {
    const executor = tx ? (tx as unknown as UntypedDb) : this.db;
    await sql`
      insert into identity.drivers (id, identifier, created_at, consented_at, deleted_at, is_admin)
      values (
        ${driver.id}, ${driver.identifier}, ${driver.createdAt},
        ${driver.consentedAt ?? null}, ${driver.deletedAt ?? null}, ${driver.isAdmin}
      )
      on conflict (id) do update set
        identifier = excluded.identifier,
        consented_at = excluded.consented_at,
        deleted_at = excluded.deleted_at
    `.execute(executor);
  }
}
