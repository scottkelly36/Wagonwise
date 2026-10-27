import { err, ok, type Result } from '../../../shared/result.js';
import type {
  FuelPrice,
  FuelSnapshot,
  FuelSourceUnavailable,
  FuelStation,
} from '../domain/fuel.js';
import type { FuelSource } from './fuel-source.js';

/**
 * Fuel Finder as it stands now, joined: every station once, and for each station and fuel its newest price. The lists come in
 * batches that change between requests, so a station can be seen twice and a price can name a station we never saw; the first
 * is merged and the second dropped, so a reader never meets a price with no place to put it. Either list failing fails the whole
 * load: half a picture would look like stations with no prices.
 */
export async function loadFuelSnapshot(
  source: FuelSource,
): Promise<Result<FuelSnapshot, FuelSourceUnavailable>> {
  const stations = await source.fetchStations();
  if (!stations.ok) return err(stations.error);
  const prices = await source.fetchPrices();
  if (!prices.ok) return err(prices.error);

  const byId = new Map<string, FuelStation>();
  for (const station of stations.value) byId.set(station.id, station);

  const newest = new Map<string, FuelPrice>();
  for (const price of prices.value) {
    if (!byId.has(price.stationId)) continue;
    const key = `${price.stationId}|${price.fuelType}`;
    const kept = newest.get(key);
    if (kept === undefined || price.updatedAt.getTime() > kept.updatedAt.getTime()) {
      newest.set(key, price);
    }
  }
  return ok({ stations: [...byId.values()], prices: [...newest.values()] });
}
