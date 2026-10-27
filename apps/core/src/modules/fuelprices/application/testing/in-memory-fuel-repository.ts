import type { FuelSnapshot } from '../../domain/fuel.js';
import type { FuelRepository, StoredFuelCounts } from '../fuel-repository.js';

/** Test-only fake: keeps the last snapshot in memory. */
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
}
