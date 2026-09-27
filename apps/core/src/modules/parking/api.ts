import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import { findNearbySafeParkingSpots } from './application/find-nearby-parking.js';
import type { GeoPoint } from './domain/safe-parking-spot.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresParkingRepository } from './infrastructure/postgres-parking-repository.js';
import { registerParkingRoutes, type ParkingRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface ParkingModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
}

export interface NearbySafeParkingSpot {
  readonly id: string;
  readonly location: GeoPoint;
  readonly note: string | undefined;
}

export interface ParkingModule {
  registerRoutes(app: FastifyInstance): void;
  findNearby(corridor: readonly GeoPoint[], radiusM: number): Promise<NearbySafeParkingSpot[]>;
}

export function createParkingModule(deps: ParkingModuleDeps): ParkingModule {
  const repo = new PostgresParkingRepository(deps.db);

  const routeDeps: ParkingRouteDeps = {
    reportSafeParkingSpot: { repo, clock: deps.clock },
    findNearbyParking: { repo },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerParkingRoutes(app, routeDeps);
    },
    async findNearby(corridor, radiusM) {
      const nearby = await findNearbySafeParkingSpots(routeDeps.findNearbyParking, {
        corridor,
        radiusM,
      });
      return nearby.map((spot) => ({
        id: spot.id,
        location: spot.location,
        note: spot.note,
      }));
    },
  };
}
