import type { CameraRepository } from '../ports/camera-repository.js';
import type { GeoPoint, SpeedCamera } from '../../domain/speed-camera.js';

const METRES_PER_DEGREE = 111_320;

function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/** Test-only: a flat-plane stand-in for the PostGIS query, near a vertex of the line rather than near the line itself. */
export class InMemoryCameraRepository implements CameraRepository {
  readonly cameras: SpeedCamera[] = [];

  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SpeedCamera[]> {
    return Promise.resolve(
      this.cameras.filter((c) => points.some((p) => metresBetween(c.location, p) <= radiusM)),
    );
  }
}
