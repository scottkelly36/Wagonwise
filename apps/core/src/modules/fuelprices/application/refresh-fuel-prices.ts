import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { FuelSourceUnavailable, SnapshotTooSmall } from '../domain/fuel.js';
import type { FuelRepository } from './fuel-repository.js';
import type { FuelSource } from './fuel-source.js';
import { loadFuelSnapshot } from './load-snapshot.js';

/** The country has about 8,000 stations. Fewer than this is a broken answer, whatever is stored. */
export const MIN_STATIONS = 500;
/** A fresh copy under this share of the stored one is refused: stations do not vanish by half between two refreshes. */
export const MIN_SHARE_OF_STORED = 0.5;

export interface RefreshSummary {
  readonly stations: number;
  readonly prices: number;
  readonly refreshedAt: Date;
}

export type RefreshError = FuelSourceUnavailable | SnapshotTooSmall;

/**
 * Fetches Fuel Finder afresh and makes our stored copy match it. The copy is replaced only by an answer that looks whole: a
 * failed fetch, an answer under {@link MIN_STATIONS} stations, or one under half the size of what is stored, leaves the last good
 * copy in place (stale prices carry their age; an empty country would carry nothing).
 */
export async function refreshFuelPrices(deps: {
  readonly source: FuelSource;
  readonly repo: FuelRepository;
  readonly clock: Clock;
}): Promise<Result<RefreshSummary, RefreshError>> {
  const snapshot = await loadFuelSnapshot(deps.source);
  if (!snapshot.ok) return err(snapshot.error);

  const received = snapshot.value.stations.length;
  const stored = (await deps.repo.counts()).stations;
  if (received < MIN_STATIONS || received < stored * MIN_SHARE_OF_STORED) {
    return err({ tag: 'SnapshotTooSmall', received, stored });
  }

  const refreshedAt = deps.clock.now();
  await deps.repo.replaceAll(snapshot.value, refreshedAt);
  return ok({ stations: received, prices: snapshot.value.prices.length, refreshedAt });
}
