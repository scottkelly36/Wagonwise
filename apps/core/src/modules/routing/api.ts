import type { FastifyInstance } from 'fastify';
import type { HazardsModule } from '../hazards/api.js';
import type { IdentityModule } from '../identity/api.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { PushNotifier } from './application/ports/push-notifier.js';
import {
  createHazardConfirmedRerouteHandler,
  createHazardReportedRerouteHandler,
  type RoutingEventHandler,
} from './application/reroute-event-handlers.js';
import { ExpoPushNotifier } from './infrastructure/expo-push-notifier.js';
import { HazardAvoidanceQueryAdapter } from './infrastructure/hazard-avoidance-query.js';
import { HazardsOnRouteQueryAdapter } from './infrastructure/hazards-on-route-query.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresActiveTripRepository } from './infrastructure/postgres-active-trip-repository.js';
import { PostgresRerouteAlertRepository } from './infrastructure/postgres-reroute-alert-repository.js';
import { PostgresRestrictionOverrideRepository } from './infrastructure/postgres-restriction-override-repository.js';
import { PostgresRoutePlanRepository } from './infrastructure/postgres-route-plan-repository.js';
import { PostgresVehicleProfileRepository } from './infrastructure/postgres-vehicle-profile-repository.js';
import { ValhallaRoutingEngine } from './infrastructure/valhalla-routing-engine.js';
import { registerRoutingRoutes, type RoutingRouteDeps } from './interface/routes.js';

// Re-exported for the same reason as the others below — composition/ types its overrides without
// reaching into application/ directly.
export type { RoutingEventHandler } from './application/reroute-event-handlers.js';
export type { PushNotification, PushNotifier } from './application/ports/push-notifier.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface RoutingModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly valhallaUrl: string;
  /** `hazards`' facade — this module's own `HazardAvoidanceQueryAdapter` (M3.5) and
   *  `HazardsOnRouteQueryAdapter` both wrap it, the same "the module wires its own adapters"
   *  pattern as `ValhallaRoutingEngine` below. Also read directly by the reroute-detection
   *  handlers (M6.4) to re-check a hazard is still active. */
  readonly hazards: Pick<HazardsModule, 'findAvoidanceCandidates' | 'findHazardIdsNear'>;
  /** `identity`'s facade — the reroute-detection handlers' only source of a driver's push
   *  tokens (design doc §6: "device tokens come from a read-model port onto Identity"). */
  readonly identity: Pick<IdentityModule, 'getPushTokensForDriver'>;
  /** Optional bearer token for Expo's enhanced push security (M6.5) — unset is fine, Expo's push
   *  API works without one; only matters if that project setting is ever turned on. */
  readonly expoAccessToken?: string | undefined;
  /** Defaults to `ExpoPushNotifier` (M6.5) — same "module wires its own adapter" precedent as
   *  `ValhallaRoutingEngine`. Override (e.g. with `ConsolePushNotifier`) for tests or local
   *  manual runs that shouldn't reach Expo's real endpoint. */
  readonly pushNotifier?: PushNotifier | undefined;
}

export interface RoutingModule {
  registerRoutes(app: FastifyInstance): void;
  /** For `composition/`'s `OutboxDispatcher` (design doc §6's alert trigger) — one handler per
   *  event type this module reacts to. Empty in Phase 1 for every module except this one (M6.1's
   *  "no module has one yet" is no longer true as of M6.4). */
  readonly eventHandlers: readonly RoutingEventHandler[];
}

/**
 * `routing`'s only public surface (AGENTS.md rule 6). Everything under `domain/`,
 * `application/`, `infrastructure/` and `interface/` is reachable only through here — same
 * pattern as identity/api.ts (M1.5). Wires its own `RoutingEngine` adapter here (decision 5, the
 * module wires its own adapters) — `ValhallaRoutingEngine`'s constructor is synchronous, unlike
 * identity's `TokenSigner`, so there's no async-boundary reason to build it in `composition/`.
 */
export function createRoutingModule(deps: RoutingModuleDeps): RoutingModule {
  const vehicleProfileRepo = new PostgresVehicleProfileRepository(deps.db);
  const routePlanRepo = new PostgresRoutePlanRepository(deps.db);
  const activeTripRepo = new PostgresActiveTripRepository(deps.db);
  const rerouteAlertRepo = new PostgresRerouteAlertRepository(deps.db);
  const restrictionOverrideRepo = new PostgresRestrictionOverrideRepository(deps.db);
  const routingEngine = new ValhallaRoutingEngine(deps.valhallaUrl);
  const hazardAvoidanceQuery = new HazardAvoidanceQueryAdapter(deps.hazards);
  const hazardsOnRouteQuery = new HazardsOnRouteQueryAdapter(deps.hazards);
  const pushNotifier = deps.pushNotifier ?? new ExpoPushNotifier(deps.expoAccessToken);

  const detectRerouteDeps = {
    activeTripRepo,
    routePlanRepo,
    vehicleProfileRepo,
    rerouteAlertRepo,
    routingEngine,
    pushNotifier,
    hazards: deps.hazards,
    identity: deps.identity,
    clock: deps.clock,
    ids: deps.ids,
  };
  const eventHandlers: readonly RoutingEventHandler[] = [
    createHazardReportedRerouteHandler(detectRerouteDeps),
    createHazardConfirmedRerouteHandler(detectRerouteDeps),
  ];

  const routeDeps: RoutingRouteDeps = {
    createVehicleProfile: { repo: vehicleProfileRepo, ids: deps.ids },
    updateVehicleProfile: { repo: vehicleProfileRepo },
    deleteVehicleProfile: { repo: vehicleProfileRepo },
    getVehicleProfile: { repo: vehicleProfileRepo },
    listVehicleProfiles: { repo: vehicleProfileRepo },
    planRoute: {
      vehicleProfileRepo,
      routePlanRepo,
      routingEngine,
      hazardAvoidanceQuery,
      hazardsOnRouteQuery,
      restrictionOverrideRepo,
      clock: deps.clock,
      ids: deps.ids,
    },
    getRoutePlan: { routePlanRepo },
    startTrip: { routePlanRepo, activeTripRepo, clock: deps.clock, ids: deps.ids },
    endTrip: { repo: activeTripRepo, clock: deps.clock },
    getActiveTrip: { activeTripRepo },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerRoutingRoutes(app, routeDeps);
    },
    eventHandlers,
  };
}
