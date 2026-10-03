import type { DomainEvent } from '../../../shared/domain-event.js';
import type { GeoPoint, HazardReport, HazardType, Measurement } from './hazard-report.js';
import type { ModerationDecision } from './moderation.js';

/**
 * `HazardReported`/`HazardConfirmed` (design doc §3's event list; §6 names both as the alert
 * trigger: "a HazardReported (or HazardConfirmed) event for a blocking hazard"). Each event type
 * defines its own payload here, in the domain, rather than in `shared/domain-event.ts` — matches
 * that file's own doc comment ("each event type defines its own payload shape where it's
 * raised"). Emitted regardless of `isBlocking(type)`: filtering to blocking types is a concern of
 * whoever *handles* the event (M6.4's future routing subscriber), not of hazards deciding on
 * their behalf what's worth publishing.
 *
 * `HazardDismissed`/`HazardExpired` are also in the design doc's own event list but have no
 * consumer yet (M6's alerting flow only reacts to reported/confirmed) — deferred until something
 * needs them, the same "don't wire an unused dependency" precedent this whole session has
 * followed (M2.3's `RoutingEngine`, M6.1's dispatcher itself).
 */
export interface HazardReportedPayload {
  readonly hazardId: string;
  readonly reporterId: string;
  readonly type: HazardType;
  readonly location: GeoPoint;
  readonly measurement?: Measurement | undefined;
}

export interface HazardConfirmedPayload {
  readonly hazardId: string;
  readonly type: HazardType;
  readonly location: GeoPoint;
  readonly measurement?: Measurement | undefined;
}

export function hazardReportedEvent(
  eventId: string,
  report: HazardReport,
): DomainEvent<HazardReportedPayload> {
  return {
    eventId,
    aggregateType: 'HazardReport',
    aggregateId: report.id,
    eventType: 'HazardReported',
    payload: {
      hazardId: report.id,
      reporterId: report.reporterId,
      type: report.type,
      measurement: report.measurement,
      location: report.location,
    },
  };
}

/** Raised both when a driver explicitly confirms an existing report and when a nearby duplicate
 *  report merges into one as an extra confirmation (`reportHazard`'s own merge path) — both are
 *  the same fact from an alerting subscriber's point of view: this hazard is still there. */
export function hazardConfirmedEvent(
  eventId: string,
  report: HazardReport,
): DomainEvent<HazardConfirmedPayload> {
  return {
    eventId,
    aggregateType: 'HazardReport',
    aggregateId: report.id,
    eventType: 'HazardConfirmed',
    payload: {
      hazardId: report.id,
      type: report.type,
      measurement: report.measurement,
      location: report.location,
    },
  };
}

/** A WagonWise moderator acted on a report (design doc §3's `HazardModerated`). Nothing consumes it
 *  yet; reporter trust (M7.2) and the per-driver hazard reports (Phase 2 reporting) will. The full
 *  before/after lives in `hazards.moderation_decisions`, so the event carries only what a
 *  subscriber needs to react to. */
export interface HazardModeratedPayload {
  readonly hazardId: string;
  readonly reporterId: string;
  readonly moderatorId: string;
  readonly action: ModerationDecision['action'];
}

export function hazardModeratedEvent(
  eventId: string,
  report: HazardReport,
  decision: ModerationDecision,
): DomainEvent<HazardModeratedPayload> {
  return {
    eventId,
    aggregateType: 'HazardReport',
    aggregateId: report.id,
    eventType: 'HazardModerated',
    payload: {
      hazardId: report.id,
      reporterId: report.reporterId,
      moderatorId: decision.moderatorId,
      action: decision.action,
    },
  };
}
