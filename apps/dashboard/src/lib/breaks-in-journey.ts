import type { HoursStatusDto } from '@wagonwise/contracts/hours';

/** A shared status older than this is not used to adjust an arrival: the driver's figures have moved on. */
export const FRESH_STATUS_MIN = 15;

export type BreakEffect =
  | { readonly kind: 'none' }
  | { readonly kind: 'breaks'; readonly breaks: number; readonly extraMin: number }
  | { readonly kind: 'rest' };

type Figures = Pick<
  HoursStatusDto,
  'drivingLeftMin' | 'next' | 'breakMin' | 'stretchMin' | 'untilLimitMin'
>;

/**
 * What a driver's breaks do to a journey of `journeyMin` minutes of driving, from the figures their phone shares. It mirrors
 * the driver app's break plan: the first break comes when the driving left runs out, then one more each time the allowed
 * stretch is used up. A journey longer than the driving left before a rest cannot be finished without one. With no figures
 * (an older app, or no break rule) nothing is added: the arrival is left as it was.
 */
export function breaksInJourney(journeyMin: number, status: Figures | undefined): BreakEffect {
  if (status === undefined) return { kind: 'none' };
  if (journeyMin <= status.drivingLeftMin) return { kind: 'none' };
  const untilLimit =
    status.untilLimitMin ?? (status.next === 'limit' ? status.drivingLeftMin : undefined);
  if (untilLimit === undefined) return { kind: 'none' };
  if (journeyMin > untilLimit) return { kind: 'rest' };
  const breakMin = status.breakMin ?? 0;
  if (breakMin <= 0) return { kind: 'none' };
  const stretch = status.stretchMin ?? 0;
  let breaks = 1;
  if (stretch > 0) {
    let left = journeyMin - status.drivingLeftMin;
    while (left > stretch) {
      breaks += 1;
      left -= stretch;
    }
  }
  return { kind: 'breaks', breaks, extraMin: breaks * breakMin };
}

/** The effect for a sharing driver, or none when their status is missing or too old. */
export function breakEffectFor(
  journeyMin: number,
  status: HoursStatusDto | undefined,
  now: Date,
): BreakEffect {
  if (status === undefined) return { kind: 'none' };
  const ageMin = (now.getTime() - new Date(status.updatedAt).getTime()) / 60_000;
  if (ageMin > FRESH_STATUS_MIN) return { kind: 'none' };
  return breaksInJourney(journeyMin, status);
}
