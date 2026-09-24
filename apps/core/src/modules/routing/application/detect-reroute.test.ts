import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { err } from '../../../shared/result.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { AvoidanceCandidate } from '../../hazards/api.js';
import type { Dimensions } from '../domain/vehicle-profile.js';
import type { PushNotification } from './ports/push-notifier.js';
import { FakeRoutingEngine } from './testing/fake-routing-engine.js';
import { InMemoryActiveTripRepository } from './testing/in-memory-active-trip-repository.js';
import { InMemoryRerouteAlertRepository } from './testing/in-memory-reroute-alert-repository.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';
import { InMemoryVehicleProfileRepository } from './testing/in-memory-vehicle-profile-repository.js';
import {
  detectReroute,
  type DetectRerouteDeps,
  type HazardAlertTrigger,
} from './detect-reroute.js';

const driverId = makeId<'DriverId'>('driver-1');
const reporterId = makeId<'DriverId'>('driver-reporter');
const profileId = makeId<'VehicleProfileId'>('profile-1');
const origin = { lat: 54.9707, lon: -2.1013 };
const destination = { lat: 54.9738, lon: -2.0165 };
const hazardLocation = { lat: 54.972, lon: -2.099 };
const now = new Date('2026-06-15T08:00:00.000Z');
const hazardId = 'hazard-1';
// A real polyline6 encoding of [origin, hazardLocation, destination] — the in-memory fakes
// (`InMemoryRoutePlanRepository`/`InMemoryActiveTripRepository`) do real proximity math against
// `decodePolyline()`'s output, so a placeholder string like 'fake-geometry' would decode to
// garbage points nowhere near `hazardLocation` and every "found nearby" test would fail (or, for
// a "nothing found" assertion, pass for the wrong reason). Encoded once via the same verified
// encoder used in postgres-route-plan-repository.test.ts.
const REAL_GEOMETRY = 'wsczgBfbg_CgpAwnCooBgc`D';

const tallVehicle: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
const shortVehicle: Dimensions = { heightM: 3.0, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

/** A blocking low-bridge candidate at `hazardLocation` with a 3.5m limit — matches
 *  `hazards/api.ts`'s own `AVOIDANCE_KIND['low_bridge'] === 'height'`. */
function blockingCandidate(overrides: Partial<AvoidanceCandidate> = {}): AvoidanceCandidate {
  return { id: hazardId, kind: 'height', limit: 3.5, location: hazardLocation, ...overrides };
}

class FakeHazards {
  candidates: AvoidanceCandidate[] = [blockingCandidate()];
  readonly calls: { corridor: readonly { lat: number; lon: number }[]; radiusM: number }[] = [];

  findAvoidanceCandidates(
    corridor: readonly { lat: number; lon: number }[],
    radiusM: number,
  ): Promise<AvoidanceCandidate[]> {
    this.calls.push({ corridor, radiusM });
    return Promise.resolve(this.candidates);
  }
}

class FakeIdentity {
  tokensByDriver = new Map<string, string[]>([[driverId, ['token-1']]]);

  getPushTokensForDriver(id: string): Promise<string[]> {
    return Promise.resolve(this.tokensByDriver.get(id) ?? []);
  }
}

class FakePushNotifier {
  readonly sent: { pushToken: string; notification: PushNotification }[] = [];

  send(pushToken: string, notification: PushNotification): Promise<void> {
    this.sent.push({ pushToken, notification });
    return Promise.resolve();
  }
}

interface Built {
  readonly deps: DetectRerouteDeps;
  readonly routePlanRepo: InMemoryRoutePlanRepository;
  readonly activeTripRepo: InMemoryActiveTripRepository;
  readonly rerouteAlertRepo: InMemoryRerouteAlertRepository;
  readonly vehicleProfileRepo: InMemoryVehicleProfileRepository;
  readonly routingEngine: FakeRoutingEngine;
  readonly hazards: FakeHazards;
  readonly identity: FakeIdentity;
  readonly pushNotifier: FakePushNotifier;
  readonly clock: FakeClock;
}

function build(): Built {
  const routePlanRepo = new InMemoryRoutePlanRepository();
  const activeTripRepo = new InMemoryActiveTripRepository(routePlanRepo);
  const rerouteAlertRepo = new InMemoryRerouteAlertRepository();
  const vehicleProfileRepo = new InMemoryVehicleProfileRepository();
  const routingEngine = new FakeRoutingEngine();
  const hazards = new FakeHazards();
  const identity = new FakeIdentity();
  const pushNotifier = new FakePushNotifier();
  const clock = new FakeClock(now);

  const deps: DetectRerouteDeps = {
    activeTripRepo,
    routePlanRepo,
    vehicleProfileRepo,
    rerouteAlertRepo,
    routingEngine,
    pushNotifier,
    hazards,
    identity,
    clock,
    ids: new SequentialIdGenerator(),
  };

  return {
    deps,
    routePlanRepo,
    activeTripRepo,
    rerouteAlertRepo,
    vehicleProfileRepo,
    routingEngine,
    hazards,
    identity,
    pushNotifier,
    clock,
  };
}

const trigger: HazardAlertTrigger = { hazardId, location: hazardLocation };

describe('detectReroute', () => {
  it('reroutes an unstarted plan whose vehicle exceeds the hazard limit, saves an alert, and notifies', async () => {
    const b = build();
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId,
      name: 'Big Wagon',
      dimensions: tallVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-1'),
      driverId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);

    await detectReroute(b.deps, trigger);

    const alertExists = await b.rerouteAlertRepo.exists(hazardId, 'route_plan', plan.id);
    expect(alertExists).toBe(true);
    expect(b.pushNotifier.sent).toHaveLength(1);
    expect(b.pushNotifier.sent[0]?.pushToken).toBe('token-1');
    expect(b.pushNotifier.sent[0]?.notification.data.newRoutePlanId).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(b.routingEngine.requests[0]).toMatchObject({
      origin,
      destination,
      dimensions: tallVehicle,
    });
  });

  it("reroutes an in-progress trip using its plan's origin (no live position tracked yet)", async () => {
    const b = build();
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId,
      name: 'Big Wagon',
      dimensions: tallVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-2'),
      driverId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);
    b.routePlanRepo.startedPlanIds.add(plan.id);
    const trip = {
      id: makeId<'ActiveTripId'>('trip-1'),
      routePlanId: plan.id,
      driverId,
      startedAt: b.clock.now(),
    };
    await b.activeTripRepo.save(trip);

    await detectReroute(b.deps, trigger);

    expect(await b.rerouteAlertRepo.exists(hazardId, 'active_trip', trip.id)).toBe(true);
    expect(b.routingEngine.requests[0]?.origin).toEqual(origin);
  });

  it('does nothing when the hazard is no longer an active blocking candidate', async () => {
    const b = build();
    b.hazards.candidates = []; // dismissed/expired/advisory by the time the handler runs
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId,
      name: 'Big Wagon',
      dimensions: tallVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-3'),
      driverId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);

    await detectReroute(b.deps, trigger);

    expect(b.pushNotifier.sent).toHaveLength(0);
    expect(await b.rerouteAlertRepo.exists(hazardId, 'route_plan', plan.id)).toBe(false);
  });

  it("skips a vehicle whose dimensions don't exceed the hazard's limit (applies() is false)", async () => {
    const b = build();
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId,
      name: 'Small Van',
      dimensions: shortVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-4'),
      driverId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);

    await detectReroute(b.deps, trigger);

    expect(b.pushNotifier.sent).toHaveLength(0);
  });

  it('never notifies the reporter of their own HazardReported event', async () => {
    const b = build();
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId: reporterId,
      name: 'Reporter Wagon',
      dimensions: tallVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-5'),
      driverId: reporterId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);

    await detectReroute(b.deps, { ...trigger, excludeDriverId: reporterId });

    expect(b.pushNotifier.sent).toHaveLength(0);
    expect(await b.rerouteAlertRepo.exists(hazardId, 'route_plan', plan.id)).toBe(false);
  });

  it('is idempotent: redelivering the same trigger sends no second notification', async () => {
    const b = build();
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId,
      name: 'Big Wagon',
      dimensions: tallVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-6'),
      driverId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);

    await detectReroute(b.deps, trigger);
    await detectReroute(b.deps, trigger);

    expect(b.pushNotifier.sent).toHaveLength(1);
  });

  it('rate-limits: stops alerting a subject once the per-hour cap is reached', async () => {
    const b = build();
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId,
      name: 'Big Wagon',
      dimensions: tallVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-7'),
      driverId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);
    // 3 alerts already sent to this subject in the last hour (a different hazard each time, so
    // the per-(hazard,subject) dedupe above doesn't itself block this one).
    for (let i = 0; i < 3; i++) {
      await b.rerouteAlertRepo.save({
        id: makeId<'RerouteAlertId'>(`prior-${i}`),
        hazardId: `other-hazard-${i}`,
        subjectType: 'route_plan',
        subjectId: plan.id,
        driverId,
        newRoutePlanId: makeId<'RoutePlanId'>(`prior-plan-${i}`),
        sentAt: b.clock.now(),
      });
    }

    await detectReroute(b.deps, trigger);

    expect(b.pushNotifier.sent).toHaveLength(0);
    expect(await b.rerouteAlertRepo.exists(hazardId, 'route_plan', plan.id)).toBe(false);
  });

  it('skips a subject when the routing engine finds no route around the hazard', async () => {
    const b = build();
    await b.vehicleProfileRepo.save({
      id: profileId,
      driverId,
      name: 'Big Wagon',
      dimensions: tallVehicle,
    });
    const plan = {
      id: makeId<'RoutePlanId'>('plan-8'),
      driverId,
      profileId,
      origin,
      destination,
      geometry: REAL_GEOMETRY,
      distanceKm: 8,
      durationMin: 10,
      avoidedRestrictions: [],
      hazardsOnRoute: [],
      createdAt: b.clock.now(),
    };
    await b.routePlanRepo.save(plan);
    b.routingEngine.result = err({ tag: 'NoRouteFound' });

    await detectReroute(b.deps, trigger);

    expect(b.pushNotifier.sent).toHaveLength(0);
    expect(await b.rerouteAlertRepo.exists(hazardId, 'route_plan', plan.id)).toBe(false);
  });
});
