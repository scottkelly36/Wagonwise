import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type Forbidden = TaggedError<'Forbidden'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

export interface Activity {
  readonly total: number;
  readonly neverSignedIn: number;
  readonly active24h: number;
  readonly active7d: number;
  readonly active30d: number;
}

export interface UsageFirm {
  readonly id: string;
  readonly name: string;
  readonly drivers: number;
  readonly vehicles: number;
  readonly staff: number;
  readonly jobsThisMonth: number;
  readonly lastActiveAt: Date | null;
}

export interface UsageReport {
  readonly generatedAt: Date;
  readonly drivers: Activity;
  readonly staff: Activity;
  readonly devices: number;
  readonly tripsRunningNow: number;
  readonly tripsPerDay: readonly { day: string; count: number }[];
  readonly jobsCreatedPerWeek: readonly { weekStart: string; count: number }[];
  readonly jobsDeliveredPerWeek: readonly { weekStart: string; count: number }[];
  readonly checksPerWeek: readonly { weekStart: string; count: number }[];
  readonly testers: number;
  readonly firms: readonly UsageFirm[];
}

/** Reads the figures across the app. Counts only: nothing here names a driver. */
export interface UsageReader {
  read(now: Date): Promise<UsageReport>;
}

export interface UsageDeps {
  readonly reader: UsageReader;
  readonly clock: { now(): Date };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many firms were active in the last week. */
export const firmsActiveThisWeek = (firms: readonly UsageFirm[], now: Date): number =>
  firms.filter((f) => f.lastActiveAt !== null && now.getTime() - f.lastActiveAt.getTime() < WEEK_MS)
    .length;

/** The usage report, for WagonWise staff only. */
export async function getUsage(
  deps: UsageDeps,
  caller: StaffCaller,
): Promise<Result<UsageReport, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return ok(await deps.reader.read(deps.clock.now()));
}
