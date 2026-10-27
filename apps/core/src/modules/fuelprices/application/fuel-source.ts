import type { Result } from '../../../shared/result.js';
import type { FuelPrice, FuelSourceUnavailable, FuelStation } from '../domain/fuel.js';

/**
 * The government's Fuel Finder, as this module needs it: every station, and every price, each in one go. The two lists are fetched
 * separately and do not line up batch for batch, so they are joined on the station id by the caller.
 */
export interface FuelSource {
  /** Whether credentials are set. Without them every fetch is `FuelSourceUnavailable` and no request is made. */
  readonly enabled: boolean;
  fetchStations(): Promise<Result<readonly FuelStation[], FuelSourceUnavailable>>;
  fetchPrices(): Promise<Result<readonly FuelPrice[], FuelSourceUnavailable>>;
}
