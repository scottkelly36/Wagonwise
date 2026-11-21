import type { SpeedLimitSign } from './speed-limit';

/** The unit the speed box is drawn in: the same as the sign beside it, so the two numbers can be compared at a glance. */
export type SpeedUnit = 'mph' | 'kph';

export interface GpsSpeedReading {
  readonly value: number;
  readonly unit: SpeedUnit;
}

const MPH_PER_MPS = 2.2369362920544;
const KPH_PER_MPS = 3.6;

/** A phone that is standing still still reports a small speed from GPS noise: below this is shown as 0, not as "1". About 1 mph. */
const STILL_BELOW_MPS = 0.5;

/** How long without a position fix before the speed on screen is no longer believed. */
export const SPEED_STALE_MS = 5000;

/** Without a fix for that long, a lorry that was already nearly stopped is taken to be stopped (the phone sends no fixes while it
 *  stands still); one that was going faster has lost its signal, and the box is hidden rather than guess. About 7 mph. */
const STOPPING_BELOW_MPS = 3;

/**
 * The speed to show from the phone's GPS speed, or nothing when the phone has no usable speed (no fix yet, no signal, or the
 * negative number some phones send for "unknown"). A guide taken from GPS, not the lorry's speedometer: the two can differ by a
 * few mph, and the box says GPS so it is never taken for the dashboard.
 */
export function gpsSpeedReading(
  speedMps: number | null | undefined,
  unit: SpeedUnit,
): GpsSpeedReading | undefined {
  if (speedMps === null || speedMps === undefined || !Number.isFinite(speedMps) || speedMps < 0) {
    return undefined;
  }
  if (speedMps < STILL_BELOW_MPS) return { value: 0, unit };
  return { value: Math.round(speedMps * (unit === 'kph' ? KPH_PER_MPS : MPH_PER_MPS)), unit };
}

/** Kilometres per hour only where the sign beside it is (the Republic of Ireland); miles per hour everywhere else, like the road signs. */
export function speedUnitFor(sign: SpeedLimitSign | undefined): SpeedUnit {
  return sign?.kind === 'limit-kph' ? 'kph' : 'mph';
}

/** What the speed becomes after {@link SPEED_STALE_MS} with no new fix: stopped if it was nearly stopped, otherwise unknown. */
export function speedAfterSilence(lastSpeedMps: number | undefined): number | undefined {
  return lastSpeedMps !== undefined && lastSpeedMps < STOPPING_BELOW_MPS ? 0 : undefined;
}

/** For a screen reader. */
export function gpsSpeedLabel(reading: GpsSpeedReading): string {
  const unit = reading.unit === 'kph' ? 'kilometres per hour' : 'miles per hour';
  return `Your speed from GPS: ${reading.value} ${unit}. This can differ from the speedometer.`;
}
