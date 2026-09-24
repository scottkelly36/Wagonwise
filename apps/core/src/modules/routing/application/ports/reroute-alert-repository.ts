import type { ActiveTripId } from '../../domain/active-trip.js';
import type { RerouteAlert, RerouteSubjectType } from '../../domain/reroute-alert.js';
import type { RoutePlanId } from '../../domain/route-plan.js';

/**
 * Backs both of design doc §6's guardrails: `exists` is "one alert per hazard per trip" (checked
 * before sending, and also what makes the handler idempotent under at-least-once delivery —
 * AGENTS.md rule 9 — a redelivered event re-finds the same alert row and sends nothing twice);
 * `countSince` is "a cap per trip per hour".
 */
export interface RerouteAlertRepository {
  exists(
    hazardId: string,
    subjectType: RerouteSubjectType,
    subjectId: ActiveTripId | RoutePlanId,
  ): Promise<boolean>;
  countSince(
    subjectType: RerouteSubjectType,
    subjectId: ActiveTripId | RoutePlanId,
    since: Date,
  ): Promise<number>;
  save(alert: RerouteAlert): Promise<void>;
}
