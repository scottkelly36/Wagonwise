import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { ItemTypeRepository } from '../application/ports/item-type-repository.js';
import type { CompanyId, IntervalUnit, ItemType, ItemTypeId } from '../domain/maintenance.js';
import type { UntypedDb } from './db.js';

interface Row {
  readonly id: string;
  readonly company_id: string;
  readonly name: string;
  readonly interval_value: number;
  readonly interval_unit: IntervalUnit;
  readonly warn_days: number;
  readonly applies_to: 'all' | 'selected';
  readonly vehicle_ids: string[];
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const COLUMNS = `id, company_id, name, interval_value, interval_unit, warn_days, applies_to, vehicle_ids,
  archived_at, created_at, updated_at`;

const toDomain = (row: Row): ItemType => ({
  id: makeId<'MaintenanceItemId'>(row.id),
  companyId: makeId<'CompanyId'>(row.company_id),
  name: row.name,
  intervalValue: row.interval_value,
  intervalUnit: row.interval_unit,
  warnDays: row.warn_days,
  appliesTo: row.applies_to,
  vehicleIds: row.vehicle_ids.map((v) => makeId<'FleetVehicleId'>(v)),
  archivedAt: row.archived_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0050) limits a request
 *  to its own company's rows; the application's permission checks come first. */
export class PostgresItemTypeRepository implements ItemTypeRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: ItemTypeId): Promise<ItemType | null> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from maintenance.item_types where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForCompany(companyId: CompanyId): Promise<ItemType[]> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from maintenance.item_types
      where company_id = ${companyId} and archived_at is null order by lower(name), created_at
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async save(item: ItemType): Promise<void> {
    await sql`
      insert into maintenance.item_types
        (id, company_id, name, interval_value, interval_unit, warn_days, applies_to, vehicle_ids,
         archived_at, created_at, updated_at)
      values (${item.id}, ${item.companyId}, ${item.name}, ${item.intervalValue}, ${item.intervalUnit},
              ${item.warnDays}, ${item.appliesTo}, ${JSON.stringify([...item.vehicleIds])}::jsonb,
              ${item.archivedAt ?? null}, ${item.createdAt}, ${item.updatedAt})
      on conflict (id) do update set
        name = excluded.name, interval_value = excluded.interval_value,
        interval_unit = excluded.interval_unit, warn_days = excluded.warn_days,
        applies_to = excluded.applies_to, vehicle_ids = excluded.vehicle_ids,
        archived_at = excluded.archived_at, updated_at = excluded.updated_at
    `.execute(this.db);
  }
}
