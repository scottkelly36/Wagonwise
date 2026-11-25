import { sql } from 'kysely';
import type { UntypedDb } from './db.js';

/** One vehicle's record of being given work: the UK day of its first job ever, and whether it had any in the range asked about. */
export interface VehicleJobDays {
  readonly vehicleId: string;
  readonly firstDay: string;
  readonly activeInRange: boolean;
}

/**
 * Which of a company's vehicles were given a job, for billing. A job counts on the day it first left draft (the day a vehicle
 * and driver were put on it), when it has a vehicle and was not cancelled: a job left as a draft is not work. It reads the jobs
 * themselves, which outlive a vehicle that is later deleted, so removing a lorry after it has worked does not take it out of the
 * month it worked in. Days are UK days, as text: never a JS Date a time zone could shift.
 */
export class PostgresVehicleJobActivity {
  constructor(private readonly db: UntypedDb) {}

  /** For every vehicle that has had a job: its first day ever, and whether any job fell on `fromDay` (inclusive) up to `toDay` (exclusive). */
  async forCompany(companyId: string, fromDay: string, toDay: string): Promise<VehicleJobDays[]> {
    const { rows } = await sql<{ vehicle_id: string; first_day: string; active: boolean }>`
      select vehicle_id,
             to_char(min(day), 'YYYY-MM-DD') as first_day,
             coalesce(bool_or(day >= ${fromDay}::date and day < ${toDay}::date), false) as active
      from (
        select j.vehicle_id,
               (
                 select (min((e ->> 'at')::timestamptz) at time zone 'Europe/London')::date
                 from jsonb_array_elements(j.timeline) as e
                 where e ->> 'status' <> 'draft'
               ) as day
        from jobs.jobs j
        where j.company_id = ${companyId} and j.vehicle_id is not null and j.status <> 'cancelled'
      ) as worked
      where day is not null
      group by vehicle_id
    `.execute(this.db);
    return rows.map((r) => ({
      vehicleId: r.vehicle_id,
      firstDay: r.first_day,
      activeInRange: r.active,
    }));
  }
}
