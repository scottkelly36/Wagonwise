import type { TripTrafficDto } from '@wagonwise/contracts/routing';

import { formatDuration } from './format-duration';

/** The first ask comes soon after the trip starts, then every few minutes while the app is in front. */
export const FIRST_TRAFFIC_DELAY_MS = 15_000;
export const TRAFFIC_INTERVAL_MS = 4 * 60_000;

/** Under this share of the route read, the delay is too thin a guess to put into the arrival time. */
const MIN_COVERAGE = 0.5;
/** A minute of traffic is noise; from this it is worth saying. */
const MIN_EXTRA_MINUTES = 2;

/** The minutes of traffic to add to the arrival time: none when traffic is off, thinly read, or small. */
export function trafficExtraMinutes(traffic: TripTrafficDto | undefined): number {
  if (traffic === undefined || !traffic.enabled) return 0;
  if (traffic.coverage < MIN_COVERAGE || traffic.extraMinutes < MIN_EXTRA_MINUTES) return 0;
  return traffic.extraMinutes;
}

/** What the arrival card says about it, or nothing. */
export function trafficNote(extraMinutes: number): string | undefined {
  return extraMinutes > 0 ? `+${formatDuration(extraMinutes)} traffic` : undefined;
}
