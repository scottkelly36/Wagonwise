import type { FastifyInstance } from 'fastify';
import type { HazardsModule } from '../hazards/api.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import { HazardAvoidanceQueryAdapter } from './infrastructure/hazard-avoidance-query.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresActiveTripRepository } from './infrastructure/postgres-active-trip-repository.js';
import { PostgresRoutePlanRepository } from './infrastructure/postgres-route-plan-repository.js';
import { PostgresVehicleProfileRepository } from './infrastructure/postgres-vehicle-profile-repository.js';
import { ValhallaRoutingEngine } from './infrastructure/valhalla-routing-engine.js';
import { registerRoutingRoutes, type RoutingRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface RoutingModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly valhallaUrl: string;
  /** `hazards`' facade — this module's own `HazardAvoidanceQueryAdapter` (M3.5) wraps it, the
   *  same "the module wires its own adapters" pattern as `ValhallaRoutingEngine` below. */
  readonly hazards: Pick<HazardsModule, 'findAvoidanceCandidates'>;
}

export interface RoutingModule {
  registerRoutes(app: FastifyInstance): void;
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
  const routingEngine = new ValhallaRoutingEngine(deps.valhallaUrl);
  const hazardAvoidanceQuery = new HazardAvoidanceQueryAdapter(deps.hazards);

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
      clock: deps.clock,
      ids: deps.ids,
    },
    startTrip: { routePlanRepo, activeTripRepo, clock: deps.clock, ids: deps.ids },
    endTrip: { repo: activeTripRepo, clock: deps.clock },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerRoutingRoutes(app, routeDeps);
    },
  };
}
