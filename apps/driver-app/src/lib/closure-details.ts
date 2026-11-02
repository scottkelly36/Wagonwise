import { CLOSURES_CREDIT, type ClosureDto } from '@wagonwise/contracts/closures';

export { CLOSURES_CREDIT };

/** National Highways' own warning that these change; shown on every closure. */
export const CLOSURE_CAVEAT = 'Times can change at short notice. Always follow the road signs.';

/**
 * The feed gives the whole window a scheme may apply, not which nights inside it. A window longer than this is probably a run of
 * closures (nights or weekends), not one closure that long, so the driver is told not to read it as shut all that time.
 */
export const LONG_WINDOW_HOURS = 48;

export const LONG_WINDOW_NOTE =
  'This is the whole period National Highways gives for the works. The road is not necessarily shut all of it.';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** The day of the month of the last Sunday of a month (month is 0 for January), as UK clock changes fall on it. */
function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

/** British Summer Time runs from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October. */
export function isBritishSummerTime(at: Date): boolean {
  const year = at.getUTCFullYear();
  const start = Date.UTC(year, 2, lastSunday(year, 2), 1);
  const end = Date.UTC(year, 9, lastSunday(year, 9), 1);
  return at.getTime() >= start && at.getTime() < end;
}

/**
 * A moment as UK clocks show it: "Sun 1 Nov, 22:00". Worked out by hand (not `Intl`) so it reads the same on every phone and in
 * the tests, and always in UK time: a closure is "at 10pm" where the road is, whatever the phone is set to.
 */
export function dayTimeText(iso: string): string {
  const at = new Date(iso);
  const local = new Date(at.getTime() + (isBritishSummerTime(at) ? MS_PER_HOUR : 0));
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${DAYS[local.getUTCDay()]} ${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]}, ${hh}:${mm}`;
}

/** How long a stretch of time is, roughly, for a driver: "under an hour", "8 hours", "3 days". */
export function durationText(fromMs: number, toMs: number): string {
  const span = Math.max(0, toMs - fromMs);
  if (span < MS_PER_HOUR) return 'under an hour';
  if (span < 2 * MS_PER_DAY) {
    const hours = Math.round(span / MS_PER_HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(span / MS_PER_DAY);
  return `${days} days`;
}

/** "eastBound" is "Eastbound"; any other word the feed uses ("inboundTowardsTown") is spelled out the same way. */
export function directionText(direction: string | undefined): string | undefined {
  if (direction === undefined || direction === '') return undefined;
  const words = direction.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  // "east bound" reads as one word on a road sign.
  const joined = words.replace(/\b(north|south|east|west) bound\b/g, '$1bound');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

const CAUSES: Readonly<Record<string, string>> = {
  roadworks: 'Roadworks',
  maintenanceWork: 'Maintenance work',
  roadsideWork: 'Roadside work',
  repairWork: 'Repair work',
  roadMarkingWork: 'Road marking',
  treeAndVegetationCuttingWork: 'Tree and vegetation cutting',
  sweepingOfRoad: 'Road sweeping',
  litterClearance: 'Litter clearance',
  roadImprovementOrUpgrading: 'Road improvement',
  constructionWork: 'Construction work',
  authorityOperation: 'Authority operation',
};

/** Why, in words. "Other" tells a driver nothing, so it is left out. */
export function causeText(cause: string | undefined): string | undefined {
  if (cause === undefined || cause === '' || cause === 'other') return undefined;
  const known = CAUSES[cause];
  if (known !== undefined) return known;
  const spelled = cause.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spelled.charAt(0).toUpperCase() + spelled.slice(1);
}

/** The heading: the road and what kind of closure, "M56 closure" or "A1 lane closure". The words below say exactly where. */
export function closureTitle(closure: Pick<ClosureDto, 'kind' | 'road'>): string {
  const what = closure.kind === 'full' ? 'closure' : 'lane closure';
  return closure.road === undefined
    ? `${what.charAt(0).toUpperCase()}${what.slice(1)}`
    : `${closure.road} ${what}`;
}

/** What is shut: a whole carriageway or slip road, or some lanes. */
export function shutText(closure: Pick<ClosureDto, 'kind' | 'lanesClosed'>): string {
  if (closure.kind === 'full') return 'Road closed to all traffic';
  if (closure.lanesClosed === 1) return '1 lane closed';
  if (closure.lanesClosed > 1) return `${closure.lanesClosed} lanes closed`;
  return 'Lanes closed';
}

/**
 * Whether the closure is in force right now. National Highways' own status says so, not the dates: a scheme's window can run for
 * months while the road is shut only on the nights inside it.
 */
export function isInForce(closure: Pick<ClosureDto, 'status'>): boolean {
  return closure.status === 'active';
}

/** The label above the heading: "In force now" or "Planned". */
export function statusLabel(closure: Pick<ClosureDto, 'status'>): string {
  return isInForce(closure) ? 'In force now' : 'Planned';
}

/**
 * When, as lines a driver can read at a glance. In force: until when, and how long is left. Planned: when it starts, when it ends and
 * how long it lasts. "Lasts" is the whole window the scheme gives, which {@link LONG_WINDOW_NOTE} explains when it is a long one.
 */
export function timingLines(
  closure: Pick<ClosureDto, 'status' | 'startsAt' | 'endsAt'>,
  now: Date,
): readonly string[] {
  const start = new Date(closure.startsAt).getTime();
  const end = new Date(closure.endsAt).getTime();
  if (isInForce(closure)) {
    // The window may already be nearly over, or the feed a little behind: never "left" for a time that has gone.
    return end > now.getTime()
      ? [`Until ${dayTimeText(closure.endsAt)}`, `About ${durationText(now.getTime(), end)} left`]
      : [`Until ${dayTimeText(closure.endsAt)}`];
  }
  return [
    // A planned closure whose window has begun is not "starting": the feed has not marked it in force yet.
    start > now.getTime()
      ? `Starts ${dayTimeText(closure.startsAt)}`
      : `Planned from ${dayTimeText(closure.startsAt)}`,
    `Until ${dayTimeText(closure.endsAt)}`,
    `Lasts ${durationText(start, end)}`,
  ];
}

/** The note for a long window, or undefined for an ordinary one. */
export function windowNote(closure: Pick<ClosureDto, 'startsAt' | 'endsAt'>): string | undefined {
  const hours =
    (new Date(closure.endsAt).getTime() - new Date(closure.startsAt).getTime()) / MS_PER_HOUR;
  return hours > LONG_WINDOW_HOURS ? LONG_WINDOW_NOTE : undefined;
}

/** The marker colours: a full closure is red (a driver cannot get through), a lane closure amber (they can). */
export function closureIsFull(closure: Pick<ClosureDto, 'kind'>): boolean {
  return closure.kind === 'full';
}
