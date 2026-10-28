import type {
  FuelPosition,
  FuelSnapshot,
  FuelType,
  NearbyFuel,
  NearbyFuelQuery,
  NearbyFuelStation,
} from '../../domain/fuel.js';
import type { FuelRepository, StoredFuelCounts } from '../fuel-repository.js';

const METRES_PER_DEGREE = 111_320;

function metresBetween(a: FuelPosition, b: FuelPosition): number {
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/** Test-only fake: keeps the last snapshot in memory, with a flat-plane stand-in for the PostGIS distance. */
export class InMemoryFuelRepository implements FuelRepository {
  snapshot: FuelSnapshot = { stations: [], prices: [] };
  refreshedAt: Date | undefined;
  replaceCalls = 0;

  replaceAll(snapshot: FuelSnapshot, refreshedAt: Date): Promise<void> {
    this.replaceCalls += 1;
    this.snapshot = snapshot;
    this.refreshedAt = refreshedAt;
    return Promise.resolve();
  }

  counts(): Promise<StoredFuelCounts> {
    return Promise.resolve({
      stations: this.snapshot.stations.length,
      prices: this.snapshot.prices.length,
      refreshedAt: this.refreshedAt,
    });
  }

  nationalMedian(fuelType: FuelType): Promise<number | undefined> {
    const open = new Set(this.snapshot.stations.filter((s) => !s.closed).map((s) => s.id));
    const prices = this.snapshot.prices
      .filter((p) => p.fuelType === fuelType && open.has(p.stationId))
      .map((p) => p.pencePerLitre)
      .sort((a, b) => a - b);
    if (prices.length === 0) return Promise.resolve(undefined);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 1 ? prices[mid] : ((prices[mid - 1] ?? 0) + (prices[mid] ?? 0)) / 2;
    return Promise.resolve(median);
  }

  findNearby(query: NearbyFuelQuery): Promise<NearbyFuel> {
    const found: NearbyFuelStation[] = [];
    for (const station of this.snapshot.stations) {
      if (station.closed) continue;
      const distanceM = metresBetween(station.position, query.centre);
      if (distanceM > query.radiusM) continue;
      const price = this.snapshot.prices.find(
        (p) => p.stationId === station.id && p.fuelType === query.fuelType,
      );
      if (price === undefined) continue;
      if (query.minPencePerLitre !== undefined && price.pencePerLitre < query.minPencePerLitre) {
        continue;
      }
      if (query.updatedSince !== undefined && price.updatedAt < query.updatedSince) continue;
      found.push({
        station,
        pencePerLitre: price.pencePerLitre,
        updatedAt: price.updatedAt,
        distanceM,
      });
    }
    found.sort(
      (a, b) =>
        a.pencePerLitre - b.pencePerLitre ||
        a.distanceM - b.distanceM ||
        a.station.id.localeCompare(b.station.id),
    );
    return Promise.resolve({
      stations: found.slice(0, query.limit),
      refreshedAt: this.refreshedAt,
    });
  }
}
