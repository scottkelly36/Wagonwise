import type { GeoPoint, SpeedCamera } from '../domain/speed-camera.js';
import type { CameraRepository } from './ports/camera-repository.js';

export interface FindNearbyCamerasDeps {
  readonly repo: CameraRepository;
}

export interface FindNearbyCamerasInput {
  readonly corridor: readonly GeoPoint[];
  readonly radiusM: number;
}

/** The cameras along a route (a decoded route line as the corridor) for the trip screen's warning. A camera never lapses,
 *  so there is nothing to filter by time. */
export function findNearbyCameras(
  deps: FindNearbyCamerasDeps,
  input: FindNearbyCamerasInput,
): Promise<SpeedCamera[]> {
  return deps.repo.findNearbyLine(input.corridor, input.radiusM);
}
