import type {
  CongestionReport,
  CongestionReportId,
  GeoPoint,
} from '../../domain/congestion-report.js';
import type { CongestionRepository } from '../ports/congestion-repository.js';

/** Flat-earth distance, good enough for a fake used only in unit tests — same reasoning and same
 *  approximation as hazards' `InMemoryHazardRepository`. */
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const METRES_PER_DEGREE_LAT = 111_320;
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export class InMemoryCongestionRepository implements CongestionRepository {
  #byId = new Map<CongestionReportId, CongestionReport>();

  /** Approximates "near the line" as "near any one of its points" — same simplification as
   *  hazards' fake; the real query (PostgresCongestionRepository) uses PostGIS's actual
   *  `ST_MakeLine`/`ST_DWithin` against the line itself. */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<CongestionReport[]> {
    const matches = [...this.#byId.values()]
      .filter((r) => points.some((p) => metresBetween(r.location, p) <= radiusM))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(matches);
  }

  save(report: CongestionReport): Promise<void> {
    this.#byId.set(report.id, report);
    return Promise.resolve();
  }
}
