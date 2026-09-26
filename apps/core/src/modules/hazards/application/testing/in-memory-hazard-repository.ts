import type { DomainEvent } from '../../../../shared/domain-event.js';
import type { GeoPoint, HazardReport, HazardReportId } from '../../domain/hazard-report.js';
import type { HazardRepository } from '../ports/hazard-repository.js';

/** Flat-earth distance, good enough for a fake used only in unit tests — the real spatial query
 *  is PostGIS's `ST_DWithin` on geography types (M3.3), which this deliberately does not try to
 *  reproduce precisely. */
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const METRES_PER_DEGREE_LAT = 111_320;
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export class InMemoryHazardRepository implements HazardRepository {
  #byId = new Map<HazardReportId, HazardReport>();
  /** Recorded, not published anywhere — lets a use-case test assert exactly which events a
   *  given call raised, the same role `outbox.events` itself plays against a real Postgres
   *  repository (`postgres-hazard-repository.test.ts`). */
  readonly emittedEvents: DomainEvent[] = [];

  findById(id: HazardReportId): Promise<HazardReport | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findNearby(location: GeoPoint, radiusM: number): Promise<HazardReport[]> {
    const matches = [...this.#byId.values()]
      .filter((r) => metresBetween(r.location, location) <= radiusM)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(matches);
  }

  /** Approximates "near the line" as "near any one of its points" — good enough for a densely
   *  sampled decoded polyline in tests; the real query (PostgresHazardRepository) uses PostGIS's
   *  actual `ST_MakeLine`/`ST_DWithin` against the line itself. */
  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<HazardReport[]> {
    const matches = [...this.#byId.values()]
      .filter((r) => points.some((p) => metresBetween(r.location, p) <= radiusM))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(matches);
  }

  findExpirable(now: Date): Promise<HazardReport[]> {
    const matches = [...this.#byId.values()].filter(
      (r) =>
        r.status === 'active' &&
        r.expiresAt !== undefined &&
        r.expiresAt.getTime() <= now.getTime(),
    );
    return Promise.resolve(matches);
  }

  save(report: HazardReport, events: readonly DomainEvent[] = []): Promise<void> {
    this.#byId.set(report.id, report);
    this.emittedEvents.push(...events);
    return Promise.resolve();
  }

  deleteById(id: HazardReportId): Promise<void> {
    this.#byId.delete(id);
    return Promise.resolve();
  }
}
