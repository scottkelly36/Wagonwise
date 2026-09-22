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
}

function toDomain(row: DriverRow): Driver {
  return { id: makeId<'DriverId'>(row.id), identifier: row.identifier, createdAt: row.created_at };
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
      select id, identifier, created_at from identity.drivers where identifier = ${identifier}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findById(id: DriverId): Promise<Driver | null> {
    const { rows } = await sql<DriverRow>`
      select id, identifier, created_at from identity.drivers where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Insert-only (the port's contract) — a duplicate id or identifier throws rather than
   *  silently upserting, since a Driver is never re-saved in Phase 1 and a second save is a bug. */
  async save(driver: Driver, tx?: Transaction): Promise<void> {
    const executor = tx ? (tx as unknown as UntypedDb) : this.db;
    await sql`
      insert into identity.drivers (id, identifier, created_at)
      values (${driver.id}, ${driver.identifier}, ${driver.createdAt})
    `.execute(executor);
  }
}
