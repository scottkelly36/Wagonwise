/**
 * Driver hours: how much legal driving time is left, worked out from what the driver did (started driving, took a break...).
 * It only advises. The tachograph is the legal record and the driver is responsible.
 *
 * The figures below were checked against GOV.UK on 2026-10-09:
 *   - https://www.gov.uk/drivers-hours/gb-domestic-rules  (10 hours driving in a day for goods vehicles)
 *   - https://www.gov.uk/drivers-hours/eu-rules  (assimilated rules: 9 hours a day, 10 twice a week; a break of 45 minutes
 *     after 4 hours 30 minutes of driving; 11 hours' daily rest, 9 hours three times between weekly rests)
 * The 15 minutes then 30 minutes split of the 45-minute break, and a week running Monday 00:00 to Sunday 24:00, are from the
 * underlying regulation, not those pages (GOV.UK does not define a week on any page we could reach), so re-read both before
 * they are relied on. The weekly (56 hour) and fortnightly (90 hour, this week and the last) driving limits are counted from
 * the 15 days kept on the phone. Not modelled yet, and never guessed: weekly rest, reduced daily rests, GB domestic duty
 * time, ferry and out-of-scope rules.
 */

export type RuleSet = 'gb_domestic' | 'assimilated_eu';

const HOUR = 3_600_000;
const MINUTE = 60_000;

interface Rules {
  /** The most driving in a day, in ms (before any twice-a-week extension). */
  readonly dailyDrivingMs: number;
  /** The extended daily limit that can be used a limited number of times a week; `null` if there is none. */
  readonly extendedDailyDrivingMs: number | null;
  /** Driving allowed before a break is needed; `null` when this rule set has no break rule that we model. */
  readonly drivingBeforeBreakMs: number | null;
  /** How long the break is, in one piece. */
  readonly breakMs: number;
  /** A break can be taken as a first part and then a second part, in that order. */
  readonly splitBreakMs: readonly [number, number] | null;
  /** A rest this long starts a new day. */
  readonly dailyRestMs: number;
  /** The most driving in a fixed week, and in two weeks running; `null` when this rule set has none that we model. */
  readonly weeklyDrivingMs: number | null;
  readonly fortnightlyDrivingMs: number | null;
}

export const RULES: Record<RuleSet, Rules> = {
  assimilated_eu: {
    dailyDrivingMs: 9 * HOUR,
    extendedDailyDrivingMs: 10 * HOUR,
    drivingBeforeBreakMs: 4.5 * HOUR,
    breakMs: 45 * MINUTE,
    splitBreakMs: [15 * MINUTE, 30 * MINUTE],
    dailyRestMs: 9 * HOUR,
    weeklyDrivingMs: 56 * HOUR,
    fortnightlyDrivingMs: 90 * HOUR,
  },
  gb_domestic: {
    dailyDrivingMs: 10 * HOUR,
    extendedDailyDrivingMs: null,
    drivingBeforeBreakMs: null,
    breakMs: 0,
    splitBreakMs: null,
    dailyRestMs: 9 * HOUR,
    weeklyDrivingMs: null,
    fortnightlyDrivingMs: null,
  },
};

export type ActivityKind = 'driving' | 'other_work' | 'break' | 'rest';

export interface Activity {
  readonly kind: ActivityKind;
  /** Milliseconds since the epoch. */
  readonly start: number;
  /** Left out while it is still going on. */
  readonly end?: number | undefined;
}

export type HoursState = 'idle' | 'driving' | 'working' | 'on_break';

export interface HoursStatus {
  readonly state: HoursState;
  /** Driving since the last break that counts. */
  readonly drivingSinceBreakMs: number;
  /** Driving time left before a break is needed; `null` when this rule set has no break rule. */
  readonly untilBreakMs: number | null;
  readonly dailyDrivingMs: number;
  readonly dailyLimitMs: number;
  /** Driving time left today; zero once the limit is reached. */
  readonly untilDailyLimitMs: number;
  /** Driving this week (a week runs Monday 00:00 to Sunday 24:00) and in this week and the one before. */
  readonly weeklyDrivingMs: number;
  readonly fortnightDrivingMs: number;
  /** Driving time left this week, and in the fortnight; `null` when this rule set has no such limit. */
  readonly untilWeeklyLimitMs: number | null;
  readonly untilFortnightLimitMs: number | null;
  /** Driving time left before the nearest of the daily, weekly and fortnightly limits, and which of them it is. */
  readonly untilLimitMs: number;
  readonly limit: 'daily' | 'weekly' | 'fortnightly';
  /** Which comes first: a break, or a limit that needs a rest. */
  readonly next: 'break' | 'limit';
  /** Time to whichever comes first. */
  readonly drivingLeftMs: number;
}

/** Monday 00:00 (the phone's own time, which is UK time for a UK driver) of the week `ms` falls in. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday).getTime();
}

export interface HoursOptions {
  readonly rules: RuleSet;
  /** Times this week the 10 hour day is still unused. Zero (the default) plans on 9 hours: the safe side. */
  readonly extensionsLeft?: number;
}

const overlap = (from: number, to: number, windowFrom: number, windowTo: number): number =>
  Math.max(0, Math.min(to, windowTo) - Math.max(from, windowFrom));

/** Activities in order, each clipped to `now`, with a still-open one running up to `now`. */
function clipped(activities: readonly Activity[], now: number): Activity[] {
  return activities
    .map((a) => ({ ...a, end: Math.min(a.end ?? now, now) }))
    .filter((a) => a.start < now && (a.end ?? now) > a.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * Works the status out at `now`. Anything not recorded between two activities counts as a rest, so a driver who stops
 * recording is not told they have driving time they did not have; only a real rest or break resets the clock.
 */
export function hoursStatus(
  activities: readonly Activity[],
  now: number,
  options: HoursOptions,
): HoursStatus {
  const rules = RULES[options.rules];
  const limit =
    rules.extendedDailyDrivingMs !== null && (options.extensionsLeft ?? 0) > 0
      ? rules.extendedDailyDrivingMs
      : rules.dailyDrivingMs;

  const thisWeek = weekStart(now);
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);
  let drivingThisWeek = 0;
  let drivingLastWeek = 0;
  let drivingToday = 0;
  let drivingSinceBreak = 0;
  let firstPartTaken = false;
  let current: HoursState = 'idle';
  let previousEnd: number | undefined;

  const resetBreak = (): void => {
    drivingSinceBreak = 0;
    firstPartTaken = false;
  };
  const rested = (duration: number): void => {
    if (duration >= rules.dailyRestMs) {
      drivingToday = 0;
      resetBreak();
    } else if (rules.drivingBeforeBreakMs !== null) {
      takeBreak(duration);
    }
  };
  const takeBreak = (duration: number): void => {
    const split = rules.splitBreakMs;
    if (duration >= rules.breakMs) resetBreak();
    else if (split !== null && firstPartTaken && duration >= split[1]) resetBreak();
    else if (split !== null && duration >= split[0]) firstPartTaken = true;
  };

  for (const a of clipped(activities, now)) {
    const end = a.end ?? now;
    if (previousEnd !== undefined && a.start > previousEnd) rested(a.start - previousEnd);
    if (a.kind === 'driving') {
      drivingToday += end - a.start;
      drivingSinceBreak += end - a.start;
      drivingThisWeek += overlap(a.start, end, thisWeek, now);
      drivingLastWeek += overlap(a.start, end, lastWeek.getTime(), thisWeek);
    } else if (a.kind === 'break') {
      rested(end - a.start);
    } else if (a.kind === 'rest') {
      rested(end - a.start);
    }
    previousEnd = end;
  }
  if (previousEnd !== undefined && previousEnd < now) rested(now - previousEnd);

  const last = clipped(activities, now).at(-1);
  if (last !== undefined && (last.end ?? now) >= now) {
    current =
      last.kind === 'driving'
        ? 'driving'
        : last.kind === 'other_work'
          ? 'working'
          : last.kind === 'break'
            ? 'on_break'
            : 'idle';
  }

  const untilBreak =
    rules.drivingBeforeBreakMs === null
      ? null
      : Math.max(0, rules.drivingBeforeBreakMs - drivingSinceBreak);
  const untilDaily = Math.max(0, limit - drivingToday);
  const untilWeekly =
    rules.weeklyDrivingMs === null ? null : Math.max(0, rules.weeklyDrivingMs - drivingThisWeek);
  const fortnight = drivingThisWeek + drivingLastWeek;
  const untilFortnight =
    rules.fortnightlyDrivingMs === null
      ? null
      : Math.max(0, rules.fortnightlyDrivingMs - fortnight);
  let untilLimit = untilDaily;
  let nearest: HoursStatus['limit'] = 'daily';
  if (untilWeekly !== null && untilWeekly < untilLimit) {
    untilLimit = untilWeekly;
    nearest = 'weekly';
  }
  if (untilFortnight !== null && untilFortnight < untilLimit) {
    untilLimit = untilFortnight;
    nearest = 'fortnightly';
  }
  const breakFirst = untilBreak !== null && untilBreak < untilLimit;
  return {
    state: current,
    drivingSinceBreakMs: drivingSinceBreak,
    untilBreakMs: untilBreak,
    dailyDrivingMs: drivingToday,
    dailyLimitMs: limit,
    untilDailyLimitMs: untilDaily,
    weeklyDrivingMs: drivingThisWeek,
    fortnightDrivingMs: fortnight,
    untilWeeklyLimitMs: untilWeekly,
    untilFortnightLimitMs: untilFortnight,
    untilLimitMs: untilLimit,
    limit: nearest,
    next: breakFirst ? 'break' : 'limit',
    drivingLeftMs: breakFirst ? untilBreak : untilLimit,
  };
}

/** "2h 05m", "45m", "0m". */
export function durationText(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / MINUTE));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * When driving at the current pace would reach the next limit, for the ETA: `now` plus the driving left. Used by break
 * planning to decide whether a break falls before the destination.
 */
export function breakDueAt(status: HoursStatus, now: number): number {
  return now + status.drivingLeftMs;
}
