import {
  RULES,
  statusFrom,
  type HoursOptions,
  type HoursState,
  type HoursStatus,
} from '../driver-hours';
import type { WorkingState } from './items';
import type { TachographSnapshot } from './snapshot';

const MINUTE = 60_000;

const STATE: Record<WorkingState, HoursState> = {
  drive: 'driving',
  // Other work, and availability (waiting): neither is a break, so neither counts towards one.
  work: 'working',
  available: 'working',
  // The tachograph records break and rest as one activity.
  rest: 'on_break',
};

/** What the tachograph must have told us for its figures to stand in for the driver's own clock. */
const REQUIRED = [
  ['workingState', 'workingState'],
  ['continuousDrivingMin', 'continuousDrivingTime'],
  ['dailyDrivingMin', 'currentDailyDrivingTime'],
  ['weeklyDrivingMin', 'currentWeeklyDrivingTime'],
  ['previousAndCurrentWeekDrivingMin', 'previousAndCurrentWeekDrivingTime'],
] as const;

export type TachographHours =
  | { readonly ok: true; readonly status: HoursStatus }
  /** The unit did not give everything needed: say what is missing, and keep using the driver's own clock for the limits. */
  | {
      readonly ok: false;
      readonly reason: 'no_consent' | 'incomplete';
      readonly missing: string[];
    };

/**
 * Turns what the tachograph said into the same status the driving-hours screen and break planning already use, so a connected unit
 * replaces the driver's own taps without changing anything they see. Nothing is guessed: a figure the unit did not give (the daily
 * and weekly driving times are optional for the unit to offer) makes the whole answer "incomplete", never a made-up number.
 */
export function tachographToHoursStatus(
  snapshot: TachographSnapshot,
  options: HoursOptions,
): TachographHours {
  if (snapshot.consent === 'withheld') return { ok: false, reason: 'no_consent', missing: [] };
  const missing = REQUIRED.filter(([field]) => snapshot[field] === undefined).map(
    ([, item]) => item,
  );
  if (missing.length > 0) return { ok: false, reason: 'incomplete', missing };

  const rules = RULES[options.rules];
  const limit =
    rules.extendedDailyDrivingMs !== null && (options.extensionsLeft ?? 0) > 0
      ? rules.extendedDailyDrivingMs
      : rules.dailyDrivingMs;
  const weekly = (snapshot.weeklyDrivingMin as number) * MINUTE;
  const fortnight = (snapshot.previousAndCurrentWeekDrivingMin as number) * MINUTE;
  return {
    ok: true,
    status: statusFrom(rules, limit, {
      state: STATE[snapshot.workingState as WorkingState],
      drivingSinceBreak: (snapshot.continuousDrivingMin as number) * MINUTE,
      drivingToday: (snapshot.dailyDrivingMin as number) * MINUTE,
      drivingThisWeek: weekly,
      // The unit gives this week and the two weeks together; the earlier week is the difference.
      drivingPreviousWeek: Math.max(0, fortnight - weekly),
    }),
  };
}
