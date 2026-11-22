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

/** How far drivers have got, as counts of different drivers. */
export interface UsageFunnel {
  readonly accounts: number;
  readonly signedIn: number;
  readonly hasVehicle: number;
  readonly plannedRoute: number;
  readonly startedTrip: number;
  readonly startedTripOnTwoDays: number;
}

/** The drivers who joined on one UK day, and how many have got as far as each stage so far. */
export interface CohortDay {
  readonly day: string;
  readonly joined: number;
  readonly hasVehicle: number;
  readonly plannedRoute: number;
  readonly startedTrip: number;
}

/** The drivers who joined in one UK week, and how many started a trip in that week and each one after it, up to this week. */
export interface RetentionWeek {
  readonly weekStart: string;
  readonly joined: number;
  readonly startedTripInWeek: readonly number[];
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

/** The planning steps, in the order a driver meets them, for the Flows funnel (docs/flow-tracking-plan.md). */
export const FLOW_FUNNEL_STEPS = [
  'plan_opened',
  'destination_chosen',
  'route_options_shown',
  'route_option_picked',
  'route_shown',
  'trip_started',
] as const;

/** Events whose fixed choices are counted on the Flows section. */
export const FLOW_CHOICE_EVENTS = [
  'vehicle_chosen',
  'load_chosen',
  'start_chosen',
  'destination_chosen',
  'route_option_picked',
  'trip_started',
  'trip_ended',
] as const;

/** The last 7 days of anonymous flow events, counted by session (one sitting in the app), never by driver. */
export interface FlowsSummary {
  readonly windowDays: number;
  readonly sessions: number;
  readonly events: number;
  readonly steps: readonly { readonly event: string; readonly sessions: number }[];
  /** Each store version and over-the-air update (its publish day; null for the store build's own code), newest first. */
  readonly byVersion: readonly {
    readonly appVersion: string;
    readonly updateDate: string | null;
    readonly sessions: number;
    readonly planOpened: number;
    readonly tripStarted: number;
  }[];
  readonly medianSeconds: {
    readonly planToPress: number | null;
    readonly routeToStart: number | null;
  };
  readonly choices: readonly {
    readonly event: string;
    readonly choice: string;
    readonly count: number;
  }[];
  readonly walkthrough: {
    readonly started: number;
    readonly finished: number;
    readonly skipped: number;
  };
  readonly remindersOpened: number;
  readonly referralOpened: number;
  readonly referralShared: number;
}

/** The last 7 days of website visits, counted without cookies (docs/modules.md, "Website visits"). */
export interface SiteSummary {
  readonly windowDays: number;
  readonly views: readonly { readonly page: string; readonly views: number }[];
  readonly videoPlays: number;
  readonly sources: readonly { readonly source: string; readonly views: number }[];
  readonly campaigns: readonly { readonly campaign: string; readonly views: number }[];
}

export interface UsageReport {
  readonly generatedAt: Date;
  /** Driver accounts that still exist: deleted ones (kept as an anonymised row) are left out of every driver figure. */
  readonly drivers: Activity;
  /** How many driver accounts have been deleted. */
  readonly deletedDrivers: number;
  readonly staff: Activity;
  readonly devices: number;
  readonly funnel: UsageFunnel;
  readonly newDriversByDay: readonly CohortDay[];
  readonly retentionByWeek: readonly RetentionWeek[];
  readonly tripsRunningNow: number;
  readonly tripsPerDay: readonly { day: string; count: number }[];
  readonly jobsCreatedPerWeek: readonly { weekStart: string; count: number }[];
  readonly jobsDeliveredPerWeek: readonly { weekStart: string; count: number }[];
  readonly checksPerWeek: readonly { weekStart: string; count: number }[];
  readonly testers: number;
  readonly firms: readonly UsageFirm[];
  readonly flows: FlowsSummary;
  readonly site: SiteSummary;
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
