import type { GeoPoint, SpeedCamera } from '../../domain/speed-camera.js';

export interface CameraRepository {
  /** Cameras within `radiusM` metres of the line through `points` (or of the point, if there is one). */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SpeedCamera[]>;
}
