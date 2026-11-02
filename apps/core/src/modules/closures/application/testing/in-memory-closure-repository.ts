import {
  ROUTE_CANDIDATE_M,
  type Closure,
  type ClosuresAlongRoute,
  type ClosuresAlongRouteQuery,
  type NearbyClosures,
  type NearbyClosuresQuery,
} from '../../domain/closure.js';
import type { ClosureRepository, StoredClosureCounts } from '../closure-repository.js';

/** Metres between two points on the earth (haversine), enough for a test double. */
function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Metres from a point to a polyline, on a flat plane around the point (fine over a few tens of metres). */
function metresToLine(
  point: { lat: number; lon: number },
  line: readonly { lat: number; lon: number }[],
): number {
  const perDegLat = 111_320;
  const perDegLon = perDegLat * Math.cos((point.lat * Math.PI) / 180);
  const at = (p: { lat: number; lon: number }) => ({
    x: (p.lon - point.lon) * perDegLon,
    y: (p.lat - point.lat) * perDegLat,
  });
  let best = Infinity;
  for (let i = 0; i < line.length; i++) {
    const a = at(line[i]!);
    const b = at(line[Math.min(i + 1, line.length - 1)]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSq));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}

export class InMemoryClosureRepository implements ClosureRepository {
  closures: readonly Closure[] = [];
  refreshedAt: Date | undefined;
  replaceCalls = 0;

  replaceAll(closures: readonly Closure[], refreshedAt: Date): Promise<void> {
    this.closures = closures;
    this.refreshedAt = refreshedAt;
    this.replaceCalls += 1;
    return Promise.resolve();
  }

  counts(): Promise<StoredClosureCounts> {
    return Promise.resolve({ closures: this.closures.length, refreshedAt: this.refreshedAt });
  }

  findNearby(query: NearbyClosuresQuery): Promise<NearbyClosures> {
    const found = this.closures
      .filter((c) => c.status !== 'suspended')
      .filter((c) => c.endsAt.getTime() > query.now.getTime())
      .filter((c) => c.startsAt.getTime() <= query.startsBefore.getTime())
      .map((closure) => ({
        closure,
        distanceM: Math.min(...closure.lines.flat().map((p) => metres(query.centre, p))),
      }))
      .filter((c) => c.distanceM <= query.radiusM)
      .sort(
        (a, b) =>
          Number(b.closure.status === 'active') - Number(a.closure.status === 'active') ||
          a.closure.startsAt.getTime() - b.closure.startsAt.getTime() ||
          a.distanceM - b.distanceM,
      )
      .slice(0, query.limit);
    return Promise.resolve({ closures: found, refreshedAt: this.refreshedAt });
  }

  findAlongRoute(query: ClosuresAlongRouteQuery): Promise<ClosuresAlongRoute> {
    const found = this.closures
      .filter((c) => c.status !== 'suspended')
      .filter((c) => c.endsAt.getTime() > query.now.getTime())
      .filter((c) => c.startsAt.getTime() <= query.startsBefore.getTime())
      .filter((c) =>
        c.lines.some((line) =>
          line.some((p) => metresToLine(p, query.corridor) <= ROUTE_CANDIDATE_M),
        ),
      )
      .sort(
        (a, b) =>
          Number(b.status === 'active') - Number(a.status === 'active') ||
          a.startsAt.getTime() - b.startsAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, query.limit);
    return Promise.resolve({ closures: found, refreshedAt: this.refreshedAt });
  }
}
