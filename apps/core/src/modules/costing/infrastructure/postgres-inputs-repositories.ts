import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { DriverRateRepository, RunningCostRepository } from '../application/inputs-ports.js';
import type { CompanyId } from '../domain/fuel.js';
import type {
  DriverRate,
  DriverRateId,
  MonthString,
  RunningCost,
  RunningCostId,
} from '../domain/inputs.js';
import type { UntypedDb } from './db.js';

interface CostRow {
  readonly id: string;
  readonly company_id: string;
  readonly vehicle_id: string | null;
  readonly description: string;
  readonly monthly_pence: string | number;
  readonly from_month: string;
  readonly to_month: string | null;
}

const COST_COLUMNS = 'id, company_id, vehicle_id, description, monthly_pence, from_month, to_month';

const toCost = (r: CostRow): RunningCost => ({
  id: makeId<'RunningCostId'>(r.id),
  companyId: makeId<'CompanyId'>(r.company_id),
  vehicleId: r.vehicle_id === null ? undefined : makeId<'FleetVehicleId'>(r.vehicle_id),
  description: r.description,
  monthlyPence: Number(r.monthly_pence),
  fromMonth: r.from_month,
  toMonth: r.to_month ?? undefined,
});

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0057) limits a request to its own
 *  company's rows. */
export class PostgresRunningCostRepository implements RunningCostRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: RunningCostId): Promise<RunningCost | null> {
    const { rows } = await sql<CostRow>`
      select ${sql.raw(COST_COLUMNS)} from costing.running_costs where id = ${id}
    `.execute(this.db);
    return rows[0] ? toCost(rows[0]) : null;
  }

  async listForCompany(companyId: CompanyId): Promise<RunningCost[]> {
    const { rows } = await sql<CostRow>`
      select ${sql.raw(COST_COLUMNS)} from costing.running_costs
      where company_id = ${companyId} order by from_month desc, description, id
    `.execute(this.db);
    return rows.map(toCost);
  }

  async insert(cost: RunningCost, by: string, at: Date): Promise<void> {
    await sql`
      insert into costing.running_costs
        (id, company_id, vehicle_id, description, monthly_pence, from_month, to_month, created_at, created_by)
      values (${cost.id}, ${cost.companyId}, ${cost.vehicleId ?? null}, ${cost.description}, ${cost.monthlyPence},
              ${cost.fromMonth}, ${cost.toMonth ?? null}, ${at}, ${by})
    `.execute(this.db);
  }

  async updateFields(
    id: RunningCostId,
    fields: { description: string; monthlyPence: number },
  ): Promise<void> {
    await sql`
      update costing.running_costs
      set description = ${fields.description}, monthly_pence = ${fields.monthlyPence} where id = ${id}
    `.execute(this.db);
  }

  async setToMonth(id: RunningCostId, toMonth: MonthString): Promise<void> {
    await sql`update costing.running_costs set to_month = ${toMonth} where id = ${id}`.execute(
      this.db,
    );
  }

  async delete(id: RunningCostId): Promise<void> {
    await sql`delete from costing.running_costs where id = ${id}`.execute(this.db);
  }
}

interface RateRow {
  readonly id: string;
  readonly company_id: string;
  readonly driver_id: string;
  readonly hourly_pence: number;
  readonly from_day: string;
}

const RATE_COLUMNS = `id, company_id, driver_id, hourly_pence, to_char(from_day, 'YYYY-MM-DD') as from_day`;

const toRate = (r: RateRow): DriverRate => ({
  id: makeId<'DriverRateId'>(r.id),
  companyId: makeId<'CompanyId'>(r.company_id),
  driverId: makeId<'DriverId'>(r.driver_id),
  hourlyPence: r.hourly_pence,
  fromDay: r.from_day,
});

export class PostgresDriverRateRepository implements DriverRateRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: DriverRateId): Promise<DriverRate | null> {
    const { rows } = await sql<RateRow>`
      select ${sql.raw(RATE_COLUMNS)} from costing.driver_rates where id = ${id}
    `.execute(this.db);
    return rows[0] ? toRate(rows[0]) : null;
  }

  async listForCompany(companyId: CompanyId): Promise<DriverRate[]> {
    const { rows } = await sql<RateRow>`
      select ${sql.raw(RATE_COLUMNS)} from costing.driver_rates
      where company_id = ${companyId} order by driver_id, from_day desc
    `.execute(this.db);
    return rows.map(toRate);
  }

  async upsert(rate: DriverRate, by: string, at: Date): Promise<void> {
    // A rate already starting that day for that driver is replaced.
    await sql`
      insert into costing.driver_rates (id, company_id, driver_id, hourly_pence, from_day, created_at, created_by)
      values (${rate.id}, ${rate.companyId}, ${rate.driverId}, ${rate.hourlyPence}, ${rate.fromDay}::date, ${at}, ${by})
      on conflict (company_id, driver_id, from_day) do update
        set hourly_pence = excluded.hourly_pence, created_at = excluded.created_at, created_by = excluded.created_by
    `.execute(this.db);
  }

  async delete(id: DriverRateId): Promise<void> {
    await sql`delete from costing.driver_rates where id = ${id}`.execute(this.db);
  }
}
