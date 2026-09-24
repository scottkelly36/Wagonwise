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

  /** Insert-only (the port's contract) — a `RerouteAlert` is never re-saved. The
   *  `(hazard_id, subject_type, subject_id)` unique index (migration 0009) makes a concurrent
   *  double-*insert* impossible even if two dispatcher passes both call `exists()` and both see
   *  false — the same check-then-act-plus-unique-index pattern decision 54 already established
   *  for `ActiveTrip`. `returning id` is what lets the caller tell "I won" from "I lost the race"
   *  (a plain `on conflict do nothing` with no `returning` can't distinguish the two, which is
   *  exactly what let a duplicate push slip through before this method reported its own result). */
  async save(alert: RerouteAlert): Promise<boolean> {
    const { rows } = await sql<{ id: string }>`
      insert into routing.reroute_alerts
        (id, hazard_id, subject_type, subject_id, driver_id, new_route_plan_id, sent_at)
      values (
        ${alert.id}, ${alert.hazardId}, ${alert.subjectType}, ${alert.subjectId},
        ${alert.driverId}, ${alert.newRoutePlanId}, ${alert.sentAt}
      )
      on conflict (hazard_id, subject_type, subject_id) do nothing
      returning id
    `.execute(this.db);
    return rows.length > 0;
  }
}
