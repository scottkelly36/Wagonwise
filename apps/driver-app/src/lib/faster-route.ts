import { formatDuration } from './format-duration';

/** The first check comes soon after a trip starts (long enough for the first fix and the first stretch of road), then every few minutes. */
export const FIRST_CHECK_DELAY_MS = 60_000;
export const CHECK_INTERVAL_MS = 3 * 60_000;

/** An offer that has not been answered goes away by itself after about a minute. That is not a choice: it can be offered again later. */
export const OFFER_VISIBLE_MS = 60_000;

export function savingText(minutes: number): string {
  if (minutes >= 60) return `Faster route: saves ${formatDuration(minutes)}`;
  return `Faster route: saves ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export function comparisonText(currentMinutes: number, alternativeMinutes: number): string {
  return `${formatDuration(alternativeMinutes)} instead of ${formatDuration(currentMinutes)}, counting traffic.`;
}
