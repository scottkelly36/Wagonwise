import { sql } from 'kysely';
import type { UntypedDb } from './db.js';

/** One vehicle's record of walk-round checks: the UK day of its first check on record, and whether it had any in the range asked about. */
export interface VehicleCheckDays {
  readonly vehicleId: string;
  readonly firstDay: string;
  readonly activeInRange: boolean;
}

/**
 * Which of a company's vehicles had a walk-round check done on them, for billing. A firm that uses WagonWise for its checks and
 * not for dispatch has no jobs on its vehicles, so a check counts as the vehicle being in use. Checks are kept for the period the
 * firm chose and then deleted, so this can only tell a vehicle's first day as far back as that.
 */
export class PostgresVehicleCheckActivity {
  constructor(private readonly db: UntypedDb) {}

  /** For every vehicle that has had a check: its first day on record, and whether any check fell on `fromDay` (inclusive) up to `toDay` (exclusive). */
  async forCompany(companyId: string, fromDay: string, toDay: string): Promise<VehicleCheckDays[]> {
    const { rows } = await sql<{ vehicle_id: string; first_day: string; active: boolean }>`
      select vehicle_id,
             to_char(min(check_day), 'YYYY-MM-DD') as first_day,
             coalesce(bool_or(check_day >= ${fromDay}::date and check_day < ${toDay}::date), false) as active
      from checks.checks
      where company_id = ${companyId}
      group by vehicle_id
    `.execute(this.db);
    return rows.map((r) => ({
      vehicleId: r.vehicle_id,
      firstDay: r.first_day,
      activeInRange: r.active,
    }));
  }
}
