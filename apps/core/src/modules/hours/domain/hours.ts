import type { Id } from '../../../shared/brand.js';
import type { TaggedError } from '../../../shared/result.js';

export type CompanyId = Id<'CompanyId'>;
export type DriverId = Id<'DriverId'>;
export type StaffId = Id<'StaffId'>;

/** What is shared. A driver who is not on a shift shares nothing (their status is deleted). */
export type HoursState = 'driving' | 'working' | 'on_break';
/** Which comes first: a break, or a limit that needs a rest. */
export type NextStop = 'break' | 'limit';

/** The wording version the driver sees when they agree; bumped whenever the consent wording changes. */
export const WORDING_VERSION = 1;

/** A status not updated for this long is out of date: it is no longer shown, and is deleted. */
export const STALE_MS = 12 * 3_600_000;

/** One driver's latest status with one company. There is only ever the latest: no history is kept. */
export interface HoursStatus {
  readonly companyId: CompanyId;
  readonly driverId: DriverId;
  readonly state: HoursState;
  /** Whole minutes of driving left before `next`. */
  readonly drivingLeftMin: number;
  readonly next: NextStop;
  /** Length of a break, the driving allowed between breaks, and the driving left before a rest; absent from an older app. */
  readonly breakMin?: number | undefined;
  readonly stretchMin?: number | undefined;
  readonly untilLimitMin?: number | undefined;
  readonly updatedAt: Date;
}

export const isFresh = (status: Pick<HoursStatus, 'updatedAt'>, now: Date): boolean =>
  now.getTime() - status.updatedAt.getTime() < STALE_MS;

export interface InvalidStatus extends TaggedError<'InvalidStatus'> {
  readonly reason: 'bad_state' | 'bad_minutes';
}

const STATES: readonly HoursState[] = ['driving', 'working', 'on_break'];

/** Checks what a driver's phone sent; the app is trusted no further than that. */
export function validateStatus(input: {
  readonly state: string;
  readonly drivingLeftMin: number;
  readonly next: string;
  readonly breakMin?: number | undefined;
  readonly stretchMin?: number | undefined;
  readonly untilLimitMin?: number | undefined;
}): InvalidStatus | undefined {
  if (!STATES.includes(input.state as HoursState) || !['break', 'limit'].includes(input.next)) {
    return { tag: 'InvalidStatus', reason: 'bad_state' };
  }
  if (
    !Number.isInteger(input.drivingLeftMin) ||
    input.drivingLeftMin < 0 ||
    input.drivingLeftMin > 24 * 60
  ) {
    return { tag: 'InvalidStatus', reason: 'bad_minutes' };
  }
  for (const extra of [input.breakMin, input.stretchMin, input.untilLimitMin]) {
    if (extra !== undefined && (!Number.isInteger(extra) || extra < 0 || extra > 24 * 60)) {
      return { tag: 'InvalidStatus', reason: 'bad_minutes' };
    }
  }
  return undefined;
}
