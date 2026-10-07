import { sql } from 'kysely';
import type { RoutingHousekeeping } from '../application/ports/routing-housekeeping.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` like routing's other repositories (decision 26). Children before parents: reroute
 *  alerts and trips refer to route plans. */
export class PostgresRoutingHousekeeping implements RoutingHousekeeping {
  constructor(private readonly db: UntypedDb) {}

  async eraseDriver(driverId: string): Promise<void> {
    await sql`
      with alerts as (delete from routing.reroute_alerts where driver_id = ${driverId} returning 1),
           trips as (delete from routing.active_trips where driver_id = ${driverId} returning 1),
           plans as (delete from routing.route_plans where driver_id = ${driverId} returning 1)
      delete from routing.vehicle_profiles where driver_id = ${driverId}
    `.execute(this.db);
  }

  async deletePlansOlderThan(cutoff: Date): Promise<number> {
    const { rows } = await sql<{ removed: string }>`
      with old as (
        select p.id from routing.route_plans p
        where p.created_at < ${cutoff}
          and not exists (
            select 1 from routing.active_trips t where t.route_plan_id = p.id and t.ended_at is null
          )
      ),
      alerts as (
        delete from routing.reroute_alerts
        where new_route_plan_id in (select id from old) or sent_at < ${cutoff}
        returning 1
      ),
      trips as (delete from routing.active_trips where route_plan_id in (select id from old) returning 1),
      plans as (delete from routing.route_plans where id in (select id from old) returning 1)
      select count(*)::text as removed from plans
    `.execute(this.db);
    return Number(rows[0]?.removed ?? 0);
  }
}
