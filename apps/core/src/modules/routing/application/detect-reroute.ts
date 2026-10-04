import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { AvoidanceCandidate, HazardsModule } from '../../hazards/api.js';
import type { IdentityModule } from '../../identity/api.js';
import { applies } from '../domain/avoidance-policy.js';
import {
  AVOID_ZONE_HALF_WIDTH_M,
  ON_ROUTE_RADIUS_M,
  bufferPoint,
  type GeoPoint,
} from '../domain/geo.js';
import type { RerouteAlert, RerouteSubjectType } from '../domain/reroute-alert.js';
import type { RoutePlan, RoutePlanId } from '../domain/route-plan.js';
import type { ActiveTripId } from '../domain/active-trip.js';
import type { DriverId, VehicleProfileId } from '../domain/vehicle-profile.js';
import type { ActiveTripRepository } from './ports/active-trip-repository.js';
import type { PushNotification, PushNotifier } from './ports/push-notifier.js';
import type { RerouteAlertRepository } from './ports/reroute-alert-repository.js';
import type { RoutePlanRepository } from './ports/route-plan-repository.js';
import type { RoutingEngine } from './ports/routing-engine.js';
import type { VehicleProfileRepository } from './ports/vehicle-profile-repository.js';

export interface DetectRerouteDeps {
  readonly activeTripRepo: ActiveTripRepository;
  readonly routePlanRepo: RoutePlanRepository;
  readonly vehicleProfileRepo: VehicleProfileRepository;
  readonly rerouteAlertRepo: RerouteAlertRepository;
  readonly routingEngine: RoutingEngine;
  readonly pushNotifier: PushNotifier;
  /** Read-model reads onto the other two contexts (AGENTS.md rule 7) — `hazards` to re-check
   *  this specific hazard is still active/blocking right now (never trust the event payload's
   *  own `type`/`measurement` for that; events can be delivered late, or more than once), and
   *  `identity` for the affected driver's push tokens (design doc §6). */
  readonly hazards: Pick<HazardsModule, 'findAvoidanceCandidates'>;
  readonly identity: Pick<IdentityModule, 'getPushTokensForDriver'>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** What triggers a reroute check (design doc §6's "trigger: a HazardReported (or
 *  HazardConfirmed) event"). Deliberately minimal — just enough to re-look-up the hazard and
 *  exclude its reporter — not a translation of the hazards event payload itself, since that
 *  would mean trusting fields this handler never needs to trust (`type`, `measurement`): the
 *  `hazards.findAvoidanceCandidates` read-model call below is what actually classifies this
 *  hazard as blocking-and-still-active, same as the existing `HazardAvoidanceQueryAdapter` does
 *  for a route's own corridor. */
export interface HazardAlertTrigger {
  readonly hazardId: string;
  readonly location: GeoPoint;
  /** Only a `HazardReported` event carries a single reporter to exclude (design doc §6: "don't
   *  notify the driver who made the report") — a `HazardConfirmed` event has none
   *  (hazards/domain/events.ts's own doc comment on `hazardConfirmedEvent`). */
  readonly excludeDriverId?: DriverId | undefined;
}

/** Design doc §6: "RoutePlans created in the last 6 hours that haven't started a trip." */
const UNSTARTED_PLAN_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Design doc §6's "a cap per trip per hour" — a guess, not a derived number, same status as
 *  `AVOID_ZONE_HALF_WIDTH_M`. */
const RATE_LIMIT_PER_SUBJECT_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const KIND_LABEL: Record<AvoidanceCandidate['kind'], string> = {
  height: 'low bridge',
  width: 'width restriction',
  weight: 'weight limit',
  prohibition: 'no-HGV restriction',
};

function buildNotification(
  kind: AvoidanceCandidate['kind'],
  newRoutePlanId: RoutePlanId,
): PushNotification {
  return {
    title: 'New hazard on your route',
    body: `A ${KIND_LABEL[kind]} was reported ahead on your route. Tap for a new route.`,
    data: { newRoutePlanId },
  };
}

interface Subject {
  readonly subjectType: RerouteSubjectType;
  readonly subjectId: ActiveTripId | RoutePlanId;
  readonly driverId: DriverId;
  readonly profileId: VehicleProfileId;
  /** The trip/plan's own origin — not the vehicle's real current position. An in-progress
   *  trip's `lastPosition` stays unset for all of Phase 1 (no position-tracking endpoint exists
   *  yet — decision, M5.6), so a mid-trip reroute is planned from where the trip *started*, not
   *  from wherever the truck actually is now. Documented gap (docs/progress.md, M6.4 deviations)
   *  — revisit once M6.6 (or later) adds real position updates. */
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
}

async function findAffectedSubjects(
  deps: Pick<DetectRerouteDeps, 'activeTripRepo' | 'routePlanRepo' | 'clock'>,
  location: GeoPoint,
): Promise<Subject[]> {
  const subjects: Subject[] = [];

  const activeTrips = await deps.activeTripRepo.findActiveNear(location, ON_ROUTE_RADIUS_M);
  for (const trip of activeTrips) {
    const plan = await deps.routePlanRepo.findById(trip.routePlanId);
    if (!plan) continue; // shouldn't happen (every trip references a real plan) — skip, not throw
    subjects.push({
      subjectType: 'active_trip',
      subjectId: trip.id,
      driverId: trip.driverId,
      profileId: plan.profileId,
      origin: trip.lastPosition ?? plan.origin,
      destination: plan.destination,
    });
  }

  const since = new Date(deps.clock.now().getTime() - UNSTARTED_PLAN_WINDOW_MS);
  const unstartedPlans = await deps.routePlanRepo.findRecentUnstartedNear(
    location,
    ON_ROUTE_RADIUS_M,
    since,
  );
  for (const plan of unstartedPlans) {
    subjects.push({
      subjectType: 'route_plan',
      subjectId: plan.id,
      driverId: plan.driverId,
      profileId: plan.profileId,
      origin: plan.origin,
      destination: plan.destination,
    });
  }

  return subjects;
}

/**
 * Design doc §6, steps 1–5: finds trips/plans near a newly (re-)reported hazard, filters to
 * vehicles it actually applies to, requests a fresh route around it, and pushes a notification.
 * Called once per `HazardReported`/`HazardConfirmed` event (the two outbox handlers in
 * `reroute-event-handlers.ts` are thin wrappers around this).
 *
 * No per-subject try/catch: every side effect here is idempotent by construction
 * (`RerouteAlertRepository.save`'s own unique index, `exists()` checked first) — AGENTS.md rule
 * 9 — so if one subject's `routingEngine.route()` throws, letting it propagate and failing the
 * whole handler is fine. The outbox dispatcher retries the event, `exists()` skips subjects
 * already alerted, and only the subjects not yet processed run again.
 */
export async function detectReroute(
  deps: DetectRerouteDeps,
  trigger: HazardAlertTrigger,
): Promise<void> {
  const candidates = await deps.hazards.findAvoidanceCandidates(
    [trigger.location],
    ON_ROUTE_RADIUS_M,
  );
  const candidate = candidates.find((c) => c.id === trigger.hazardId);
  if (!candidate) {
    // Not a blocking type, already expired, or already dismissed by the time this handler ran —
    // genuinely nothing to reroute around (same "active right now" check
    // `HazardAvoidanceQueryAdapter` already relies on for route planning).
    return;
  }

  const zone = bufferPoint(trigger.location, AVOID_ZONE_HALF_WIDTH_M);
  const subjects = await findAffectedSubjects(deps, trigger.location);

  for (const subject of subjects) {
    if (trigger.excludeDriverId !== undefined && subject.driverId === trigger.excludeDriverId) {
      continue;
    }

    const profile = await deps.vehicleProfileRepo.findById(subject.profileId);
    if (!profile) continue; // profile deleted since the plan/trip was created — nothing to route

    const obstruction = {
      id: candidate.id,
      kind: candidate.kind,
      ...(candidate.limit === undefined ? {} : { limit: candidate.limit }),
      zone,
    };
    if (!applies(obstruction, profile.dimensions)) {
      continue;
    }

    if (
      await deps.rerouteAlertRepo.exists(trigger.hazardId, subject.subjectType, subject.subjectId)
    ) {
      continue;
    }
    const rateLimitSince = new Date(deps.clock.now().getTime() - RATE_LIMIT_WINDOW_MS);
    const recentCount = await deps.rerouteAlertRepo.countSince(
      subject.subjectType,
      subject.subjectId,
      rateLimitSince,
    );
    if (recentCount >= RATE_LIMIT_PER_SUBJECT_PER_HOUR) continue;

    const routed = await deps.routingEngine.route({
      origin: subject.origin,
      destination: subject.destination,
      dimensions: profile.dimensions,
      avoid: [zone],
    });
    if (!routed.ok) continue; // genuinely no way around it — no new route id to notify with

    const newPlan: RoutePlan = {
      id: makeId<'RoutePlanId'>(deps.ids.newId()),
      driverId: subject.driverId,
      profileId: subject.profileId,
      origin: subject.origin,
      destination: subject.destination,
      geometry: routed.value.geometry,
      distanceKm: routed.value.distanceKm,
      durationMin: routed.value.durationMin,
      avoidedRestrictions: [],
      maneuvers: routed.value.maneuvers,
      hazardsOnRoute: [trigger.hazardId],
      createdAt: deps.clock.now(),
    };
    await deps.routePlanRepo.save(newPlan);

    const alert: RerouteAlert = {
      id: makeId<'RerouteAlertId'>(deps.ids.newId()),
      hazardId: trigger.hazardId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      driverId: subject.driverId,
      newRoutePlanId: newPlan.id,
      sentAt: deps.clock.now(),
    };
    const won = await deps.rerouteAlertRepo.save(alert);
    if (!won) continue; // lost a race against another concurrent delivery of the same event —
    // that execution already sent (or is about to send) this subject's push; sending it again
    // here would wake the driver twice about the same bridge (AGENTS.md rule 9).

    const tokens = await deps.identity.getPushTokensForDriver(subject.driverId);
    const notification = buildNotification(candidate.kind, newPlan.id);
    for (const token of tokens) {
      await deps.pushNotifier.send(token, notification);
    }
  }
}
