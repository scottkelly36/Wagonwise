import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { TemplateRepository } from '../application/ports/template-repository.js';
import type {
  CheckItem,
  CheckTemplate,
  CheckTemplateId,
  CompanyId,
  VehicleId,
} from '../domain/check-template.js';
import type { UntypedDb } from './db.js';

interface TemplateRow {
  readonly id: string;
  readonly company_id: string;
  readonly name: string;
  readonly applies_to: 'all' | 'selected';
  readonly vehicle_ids: string[];
  readonly items: CheckItem[];
  readonly version: number;
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const COLUMNS = `id, company_id, name, applies_to, vehicle_ids, items, version, archived_at, created_at, updated_at`;

const toDomain = (row: TemplateRow): CheckTemplate => ({
  id: makeId<'CheckTemplateId'>(row.id),
  companyId: makeId<'CompanyId'>(row.company_id),
  name: row.name,
  appliesTo: row.applies_to,
  vehicleIds: row.vehicle_ids.map((v) => makeId<'FleetVehicleId'>(v)),
  items: row.items,
  version: row.version,
  archivedAt: row.archived_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0043) does the
 *  company filtering as well; the `company_id` condition is the application's own. */
export class PostgresTemplateRepository implements TemplateRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: CheckTemplateId): Promise<CheckTemplate | null> {
    const { rows } = await sql<TemplateRow>`
      select ${sql.raw(COLUMNS)} from checks.templates where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForCompany(companyId: CompanyId): Promise<CheckTemplate[]> {
    const { rows } = await sql<TemplateRow>`
      select ${sql.raw(COLUMNS)} from checks.templates
      where company_id = ${companyId} and archived_at is null
      order by lower(name), created_at
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async save(template: CheckTemplate): Promise<void> {
    const vehicleIds: VehicleId[] = [...template.vehicleIds];
    await sql`
      insert into checks.templates
        (id, company_id, name, applies_to, vehicle_ids, items, version, archived_at, created_at, updated_at)
      values (${template.id}, ${template.companyId}, ${template.name}, ${template.appliesTo},
              ${JSON.stringify(vehicleIds)}::jsonb, ${JSON.stringify(template.items)}::jsonb,
              ${template.version}, ${template.archivedAt ?? null}, ${template.createdAt}, ${template.updatedAt})
      on conflict (id) do update set
        name = excluded.name, applies_to = excluded.applies_to, vehicle_ids = excluded.vehicle_ids,
        items = excluded.items, version = excluded.version, archived_at = excluded.archived_at,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }
}
