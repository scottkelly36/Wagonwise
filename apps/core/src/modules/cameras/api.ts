import { findNearbyCameras } from './application/find-nearby-cameras.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresCameraRepository } from './infrastructure/postgres-camera-repository.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';

export interface CamerasModuleDeps {
  readonly db: UntypedDb;
}

export type CameraKind = 'fixed' | 'average' | 'red_light';

export interface NearbyCamera {
  readonly id: string;
  readonly location: { readonly lat: number; readonly lon: number };
  readonly kind: CameraKind;
  /** The limit the map gives for the camera, in mph, when it says one. */
  readonly maxspeedMph: number | undefined;
}

export interface CamerasModule {
  /** Cameras within `radiusM` metres of the line through `points`. For `routing`, which asks along a planned route. */
  findNear(
    points: readonly { readonly lat: number; readonly lon: number }[],
    radiusM: number,
  ): Promise<NearbyCamera[]>;
}

/**
 * `cameras`' only public surface (AGENTS.md rule 6): where fixed speed and red-light cameras are, from OpenStreetMap. Read only;
 * the starting set is a migration. It has no routes of its own: `routing` asks for the cameras along a driver's route plan.
 */
export function createCamerasModule(deps: CamerasModuleDeps): CamerasModule {
  const repo = new PostgresCameraRepository(deps.db);
  return {
    async findNear(points, radiusM) {
      const cameras = await findNearbyCameras({ repo }, { corridor: points, radiusM });
      return cameras.map((c) => ({
        id: c.id,
        location: c.location,
        kind: c.kind,
        maxspeedMph: c.maxspeedMph,
      }));
    },
  };
}
