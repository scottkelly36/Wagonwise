import type { ActiveTripId } from '../../domain/active-trip.js';
import type { RerouteAlert, RerouteSubjectType } from '../../domain/reroute-alert.js';
import type { RoutePlanId } from '../../domain/route-plan.js';
import type { RerouteAlertRepository } from '../ports/reroute-alert-repository.js';

export class InMemoryRerouteAlertRepository implements RerouteAlertRepository {
  readonly #alerts: RerouteAlert[] = [];

  exists(
    hazardId: string,
    subjectType: RerouteSubjectType,
    subjectId: ActiveTripId | RoutePlanId,
  ): Promise<boolean> {
    return Promise.resolve(
      this.#alerts.some(
        (a) =>
          a.hazardId === hazardId && a.subjectType === subjectType && a.subjectId === subjectId,
      ),
    );
  }

  countSince(
    subjectType: RerouteSubjectType,
    subjectId: ActiveTripId | RoutePlanId,
    since: Date,
  ): Promise<number> {
    return Promise.resolve(
      this.#alerts.filter(
        (a) =>
          a.subjectType === subjectType &&
          a.subjectId === subjectId &&
          a.sentAt.getTime() >= since.getTime(),
      ).length,
    );
  }

  /** Mirrors the Postgres adapter's `returning id`-derived boolean — `false` on a duplicate
   *  `(hazardId, subjectType, subjectId)` triple, same as its real unique-index conflict. */
  save(alert: RerouteAlert): Promise<boolean> {
    const isDuplicate = this.#alerts.some(
      (a) =>
        a.hazardId === alert.hazardId &&
        a.subjectType === alert.subjectType &&
        a.subjectId === alert.subjectId,
    );
    if (isDuplicate) return Promise.resolve(false);
    this.#alerts.push(alert);
    return Promise.resolve(true);
  }
}
