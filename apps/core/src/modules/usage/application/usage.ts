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

/** The headline figures: who uses the app, how far drivers get, and how many firms. */
export interface UsageOverview {
  readonly generatedAt: Date;
  /** Driver accounts that still exist: deleted ones (kept as an anonymised row) are left out of every driver figure. */
  readonly drivers: Activity;
  /** How many driver accounts have been deleted. */
  readonly deletedDrivers: number;
  readonly staff: Activity;
  readonly devices: number;
  readonly testers: number;
  readonly tripsRunningNow: number;
  readonly tripsToday: number;
  readonly firms: { readonly total: number; readonly activeThisWeek: number };
  readonly funnel: UsageFunnel;
}

/** New drivers by day and how many come back week by week. */
export interface UsageDrivers {
  readonly generatedAt: Date;
  readonly newDriversByDay: readonly CohortDay[];
  readonly retentionByWeek: readonly RetentionWeek[];
}

/** Trips, jobs and checks over the last weeks. */
export interface UsageActivity {
  readonly generatedAt: Date;
  readonly tripsPerDay: readonly { day: string; count: number }[];
  readonly jobsCreatedPerWeek: readonly { weekStart: string; count: number }[];
  readonly jobsDeliveredPerWeek: readonly { weekStart: string; count: number }[];
  readonly checksPerWeek: readonly { weekStart: string; count: number }[];
}

export interface UsageFirms {
  readonly generatedAt: Date;
  readonly firms: readonly UsageFirm[];
}

/**
 * The usage figures, one view at a time so the page only pays for the view it is showing: each section is its own set of queries and
 * its own request. Counts only: nothing here names a driver.
 */
export interface UsageReader {
  overview(now: Date): Promise<UsageOverview>;
  drivers(now: Date): Promise<UsageDrivers>;
  activity(now: Date): Promise<UsageActivity>;
  firms(now: Date): Promise<UsageFirms>;
  flows(now: Date): Promise<FlowsSummary>;
  site(now: Date): Promise<SiteSummary>;
}

export interface UsageDeps {
  readonly reader: UsageReader;
  readonly clock: { now(): Date };
}

/** The sections of the usage page that come from this reader (the portal report has its own). */
export const USAGE_SECTIONS = [
  'overview',
  'drivers',
  'activity',
  'firms',
  'flows',
  'site',
] as const;
export type UsageSection = (typeof USAGE_SECTIONS)[number];

interface UsageSectionData {
  readonly overview: UsageOverview;
  readonly drivers: UsageDrivers;
  readonly activity: UsageActivity;
  readonly firms: UsageFirms;
  readonly flows: FlowsSummary;
  readonly site: SiteSummary;
}

/** One section of the usage report, for WagonWise staff only. */
export async function getUsageSection<S extends UsageSection>(
  deps: UsageDeps,
  caller: StaffCaller,
  section: S,
): Promise<Result<UsageSectionData[S], Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const data = await deps.reader[section](deps.clock.now());
  return ok(data as UsageSectionData[S]);
}
