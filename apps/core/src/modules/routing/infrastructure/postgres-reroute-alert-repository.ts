import { sql } from 'kysely';
import type { RerouteAlertRepository } from '../application/ports/reroute-alert-repository.js';
import type { ActiveTripId } from '../domain/active-trip.js';
import type { RerouteAlert, RerouteSubjectType } from '../domain/reroute-alert.js';
import type { RoutePlanId } from '../domain/route-plan.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as
 *  routing's other repositories (decision 26, docs/progress.md). */
export class PostgresRerouteAlertRepository implements RerouteAlertRepository {
  constructor(private readonly db: UntypedDb) {}

  async exists(
    hazardId: string,
    subjectType: RerouteSubjectType,
    subjectId: ActiveTripId | RoutePlanId,
  ): Promise<boolean> {
    const { rows } = await sql`
      select 1 from routing.reroute_alerts
      where hazard_id = ${hazardId} and subject_type = ${subjectType} and subject_id = ${subjectId}
    `.execute(this.db);
    return rows.length > 0;
  }

  async countSince(
    subjectType: RerouteSubjectType,
    subjectId: ActiveTripId | RoutePlanId,
    since: Date,
  ): Promise<number> {
    const { rows } = await sql<{ count: string }>`
      select count(*)::text as count from routing.reroute_alerts
      where subject_type = ${subjectType} and subject_id = ${subjectId} and sent_at >= ${since}
    `.execute(this.db);
    return Number(rows[0]?.count ?? '0');
  }

  /** Insert-only (the port's contract) — a `RerouteAlert` is never re-saved. Relies on the
   *  `(hazard_id, subject_type, subject_id)` unique index (migration 0009) to make a concurrent
   *  double-send impossible even if two dispatcher passes both call `exists()` and both see
   *  false — the same check-then-act-plus-unique-index pattern decision 54 already established
   *  for `ActiveTrip`. */
  async save(alert: RerouteAlert): Promise<void> {
    await sql`
      insert into routing.reroute_alerts
        (id, hazard_id, subject_type, subject_id, driver_id, new_route_plan_id, sent_at)
      values (
        ${alert.id}, ${alert.hazardId}, ${alert.subjectType}, ${alert.subjectId},
        ${alert.driverId}, ${alert.newRoutePlanId}, ${alert.sentAt}
      )
      on conflict (hazard_id, subject_type, subject_id) do nothing
    `.execute(this.db);
  }
}
