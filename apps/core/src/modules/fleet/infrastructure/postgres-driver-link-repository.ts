import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { DomainEvent } from '../../../shared/domain-event.js';
import type { DriverLinkRepository } from '../application/ports/driver-link-repository.js';
import type {
  DriverId,
  DriverLink,
  DriverLinkId,
  DriverLinkStatus,
} from '../domain/driver-link.js';
import type { CompanyId } from '../domain/vehicle.js';
import type { UntypedDb } from './db.js';

interface LinkRow {
  readonly id: string;
  readonly company_id: string;
  readonly driver_id: string | null;
  readonly invited_identifier: string | null;
  readonly status: DriverLinkStatus;
  readonly created_at: Date;
  readonly decided_at: Date | null;
}

const SELECT_COLUMNS = `
  id, company_id, driver_id, invited_identifier, status, created_at, decided_at
`;

function toDomain(row: LinkRow): DriverLink {
  return {
    id: makeId<'DriverLinkId'>(row.id),
    companyId: makeId<'CompanyId'>(row.company_id),
    status: row.status,
    createdAt: row.created_at,
    ...(row.driver_id === null ? {} : { driverId: makeId<'DriverId'>(row.driver_id) }),
    ...(row.invited_identifier === null ? {} : { invitedIdentifier: row.invited_identifier }),
    ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
  };
}

/** Raw `sql` tagged-template queries, like every other repository (decision 26). */
export class PostgresDriverLinkRepository implements DriverLinkRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: DriverLinkId): Promise<DriverLink | null> {
    const { rows } = await sql<LinkRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.driver_links where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findLive(companyId: CompanyId, driverId: DriverId): Promise<DriverLink | null> {
    const { rows } = await sql<LinkRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.driver_links
      where company_id = ${companyId} and driver_id = ${driverId}
        and status in ('invited', 'requested', 'active')
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findPendingInvite(companyId: CompanyId, identifier: string): Promise<DriverLink | null> {
    const { rows } = await sql<LinkRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.driver_links
      where company_id = ${companyId} and invited_identifier = ${identifier}
        and status = 'invited'
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForCompany(companyId: CompanyId): Promise<DriverLink[]> {
    const { rows } = await sql<LinkRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.driver_links
      where company_id = ${companyId} order by created_at desc, id
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async listForDriver(driverId: DriverId, identifier: string): Promise<DriverLink[]> {
    const { rows } = await sql<LinkRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.driver_links
      where driver_id = ${driverId}
         or (status = 'invited' and invited_identifier = ${identifier})
      order by created_at desc, id
    `.execute(this.db);
    return rows.map(toDomain);
  }

  /** No `db.transaction()`: the routes run inside a `DataScopes.run` transaction, which rejects a
   *  nested one (docs/progress.md), and that transaction keeps the link and its events atomic. */
  async save(link: DriverLink, events: readonly DomainEvent[] = []): Promise<void> {
    await sql`
      insert into fleet.driver_links
        (id, company_id, driver_id, invited_identifier, status, created_at, decided_at)
      values (
        ${link.id}, ${link.companyId}, ${link.driverId ?? null}, ${link.invitedIdentifier ?? null},
        ${link.status}, ${link.createdAt}, ${link.decidedAt ?? null}
      )
      on conflict (id) do update set
        driver_id = excluded.driver_id,
        invited_identifier = excluded.invited_identifier,
        status = excluded.status,
        decided_at = excluded.decided_at
    `.execute(this.db);
    for (const event of events) {
      await sql`
        insert into outbox.events (event_id, aggregate_type, aggregate_id, event_type, payload)
        values (${event.eventId}, ${event.aggregateType}, ${event.aggregateId}, ${event.eventType}, ${JSON.stringify(event.payload)})
      `.execute(this.db);
    }
  }
}
