import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { PlanRepository } from '../application/ports/plan-repository.js';
import type { StaffId } from '../domain/billing-details.js';
import type { CapacityChange, CompanyId } from '../domain/plan.js';
import type { UntypedDb } from './db.js';

interface ChangeRow {
  readonly company_id: string;
  readonly effective_from: string;
  readonly capacity: number;
}

// `effective_from` is a date, so it is read back as text (`to_char`), never as a JS Date that a time zone
// could shift by a day.
const CHANGE_COLUMNS = `company_id, to_char(effective_from, 'YYYY-MM-DD') as effective_from, capacity`;

const toChange = (row: ChangeRow): CapacityChange => ({
  companyId: makeId<'CompanyId'>(row.company_id),
  effectiveFrom: row.effective_from,
  capacity: row.capacity,
});

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0040) lets a
 *  WagonWise admin read and write everything, and a company read only its own rows. */
export class PostgresPlanRepository implements PlanRepository {
  constructor(private readonly db: UntypedDb) {}

  async listPrices(): Promise<ReadonlyMap<CompanyId, number>> {
    const { rows } = await sql<{ company_id: string; price: number }>`
      select company_id, price_per_vehicle_pence as price from billing.plans
    `.execute(this.db);
    return new Map(rows.map((r) => [makeId<'CompanyId'>(r.company_id), r.price]));
  }

  async setPrice(companyId: CompanyId, pence: number, by: StaffId, at: Date): Promise<void> {
    await sql`
      insert into billing.plans (company_id, price_per_vehicle_pence, updated_at, updated_by)
      values (${companyId}, ${pence}, ${at}, ${by})
      on conflict (company_id) do update set
        price_per_vehicle_pence = excluded.price_per_vehicle_pence,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `.execute(this.db);
  }

  async listChanges(companyId: CompanyId): Promise<CapacityChange[]> {
    const { rows } = await sql<ChangeRow>`
      select ${sql.raw(CHANGE_COLUMNS)} from billing.capacity_changes
      where company_id = ${companyId} order by effective_from
    `.execute(this.db);
    return rows.map(toChange);
  }

  async listAllChanges(): Promise<CapacityChange[]> {
    const { rows } = await sql<ChangeRow>`
      select ${sql.raw(CHANGE_COLUMNS)} from billing.capacity_changes
      order by company_id, effective_from
    `.execute(this.db);
    return rows.map(toChange);
  }

  async setCapacity(change: CapacityChange, by: StaffId, at: Date): Promise<void> {
    await sql`
      insert into billing.capacity_changes (id, company_id, effective_from, capacity, created_at, created_by)
      values (gen_random_uuid(), ${change.companyId}, ${change.effectiveFrom}::date, ${change.capacity}, ${at}, ${by})
      on conflict (company_id, effective_from) do update set
        capacity = excluded.capacity, created_at = excluded.created_at, created_by = excluded.created_by
    `.execute(this.db);
  }
}
