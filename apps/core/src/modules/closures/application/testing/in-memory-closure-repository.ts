import type { Closure, NearbyClosures, NearbyClosuresQuery } from '../../domain/closure.js';
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
}
