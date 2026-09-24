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
  /** Returns `true` if this call actually inserted a new row, `false` if it lost a race against
   *  another concurrent save for the same `(hazardId, subjectType, subjectId)` triple (a no-op).
   *  The caller must treat `false` exactly like `exists()` having already returned `true` —
   *  skipping the push too, not just the write — since at-least-once delivery (AGENTS.md rule 9)
   *  means the same event can genuinely be dispatched twice with overlapping, not sequential,
   *  handler executions (the claim transaction's row lock is released once claimed, not held for
   *  the handler's own duration — `platform/outbox-dispatcher.ts`'s own doc comment). */
  save(alert: RerouteAlert): Promise<boolean>;
}
