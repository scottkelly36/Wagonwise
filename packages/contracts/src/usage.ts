import { z } from 'zod';

const count = z.number().int().min(0);

/** People who signed in: how many accounts, and how many used the app in the last day, week and month. */
export const activitySchema = z.object({
  total: count,
  neverSignedIn: count,
  active24h: count,
  active7d: count,
  active30d: count,
});
export type ActivityDto = z.infer<typeof activitySchema>;

export const dayCountSchema = z.object({ day: z.string(), count });
export const weekCountSchema = z.object({ weekStart: z.string(), count });

/**
 * How far drivers have got, as counts of different drivers (nobody is named). Each stage is a count of drivers who have done
 * that, so the figures can be compared with the number of accounts. Trips older than the route retention period (30 days) are
 * deleted, so the trip figures cover that period.
 */
export const funnelSchema = z.object({
  accounts: count,
  signedIn: count,
  hasVehicle: count,
  plannedRoute: count,
  startedTrip: count,
  /** Started trips on two or more different UK days: the drivers who came back. */
  startedTripOnTwoDays: count,
});
export type FunnelDto = z.infer<typeof funnelSchema>;

/**
 * The drivers who joined on one UK day, and how many of them have got as far as each stage so far. This is the way to tell
 * whether a change to the app helped: the running totals in `funnel` change slowly, but a day's new drivers are all on the
 * same version.
 */
export const cohortDaySchema = z.object({
  day: z.string(),
  joined: count,
  hasVehicle: count,
  plannedRoute: count,
  startedTrip: count,
});
export type CohortDayDto = z.infer<typeof cohortDaySchema>;

/**
 * The drivers who joined in one UK week (Monday start), and how many of them started a trip in that week and in each week after
 * it, up to and including this one (which is not over yet). `startedTripInWeek[0]` is the week they joined, `[1]` the week after,
 * and so on. This is the "do they come back" view: the running totals cannot tell a driver who drives every week from one who
 * tried it once.
 */
export const retentionWeekSchema = z.object({
  weekStart: z.string(),
  joined: count,
  startedTripInWeek: z.array(count),
});
export type RetentionWeekDto = z.infer<typeof retentionWeekSchema>;

export const usageFirmSchema = z.object({
  id: z.string(),
  name: z.string(),
  drivers: count,
  vehicles: count,
  staff: count,
  jobsThisMonth: count,
  lastActiveAt: z.string().nullable(),
});
export type UsageFirmDto = z.infer<typeof usageFirmSchema>;

/**
 * The anonymous flow events of the last 7 days (docs/flow-tracking-plan.md), as counts of sessions: one session is one sitting in the
 * app, not a driver, so a driver who plans twice counts twice.
 */
export const flowsReportSchema = z.object({
  windowDays: count,
  sessions: count,
  events: count,
  /** The planning steps in order, each with the sessions that reached it. */
  steps: z.array(z.object({ event: z.string(), sessions: count })),
  /** The same, from opening Plan route to starting a trip, by app version, newest first. */
  byVersion: z.array(
    z.object({
      appVersion: z.string(),
      /** The over-the-air update's publish day, or null for the store build's own code (or an app too old to say). Optional: a
       *  core from before it was sent has none. */
      updateDate: z.string().nullable().optional(),
      sessions: count,
      planOpened: count,
      tripStarted: count,
    }),
  ),
  /** Median seconds from opening Plan route to pressing it, and from seeing the route to starting the trip; null with no data. */
  medianSeconds: z.object({
    planToPress: z.number().nullable(),
    routeToStart: z.number().nullable(),
  }),
  /** How often each fixed choice was made, most common first within each event. */
  choices: z.array(z.object({ event: z.string(), choice: z.string(), count })),
  walkthrough: z.object({ started: count, finished: count, skipped: count }),
  remindersOpened: count,
  /** Optional: a core from before these were counted sends none. */
  referralOpened: count.optional(),
  referralShared: count.optional(),
});
export type FlowsReportDto = z.infer<typeof flowsReportSchema>;

/**
 * `GET /staff/usage` (WagonWise staff only): how the app is being used. Counts only: no driver is named. "Active" means a
 * session was used (a sign-in or a refresh) in the window.
 */
/** The website's pages that are counted; anything else is refused (docs/modules.md, "Website visits"). */
export const SITE_PAGES = ['/', '/for-hauliers/', '/privacy/', '/delete-account/'] as const;

/**
 * `POST /signups/visits` from the website (no account, no cookie): a page was opened, or the For hauliers video was played. Where
 * the visitor came from is only a short source name (a `utm_source`, or the referring site's host) and a campaign name; no address,
 * no IP, nothing that identifies a person is kept.
 */
export const siteVisitRequestSchema = z.object({
  kind: z.enum(['view', 'video_play']),
  page: z.enum(SITE_PAGES),
  source: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{1,60}$/)
    .optional(),
  campaign: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{1,60}$/)
    .optional(),
});
export type SiteVisitRequest = z.infer<typeof siteVisitRequestSchema>;

/** The last 7 days of website visits, for the usage page. */
export const siteReportSchema = z.object({
  windowDays: count,
  views: z.array(z.object({ page: z.string(), views: count })),
  videoPlays: count,
  /** Most first; "direct" when there was no source. */
  sources: z.array(z.object({ source: z.string(), views: count })),
  campaigns: z.array(z.object({ campaign: z.string(), views: count })),
});
export type SiteReportDto = z.infer<typeof siteReportSchema>;

export const usageReportSchema = z.object({
  generatedAt: z.string(),
  drivers: activitySchema,
  staff: activitySchema,
  firms: z.object({ total: count, activeThisWeek: count }),
  devices: z.object({ total: count }),
  funnel: funnelSchema,
  /** The last 14 UK days, oldest first, by the day an account was made. Days with no new drivers are included. */
  newDriversByDay: z.array(cohortDaySchema),
  /** The last 8 UK weeks of new drivers, oldest first, weeks with none included. Optional: a core from before it sends none. */
  retentionByWeek: z.array(retentionWeekSchema).optional(),
  tripsRunningNow: count,
  /** The last 14 UK days, oldest first, days with none included. */
  tripsPerDay: z.array(dayCountSchema),
  /** The last 8 UK weeks (Monday starts), oldest first. */
  jobsCreatedPerWeek: z.array(weekCountSchema),
  jobsDeliveredPerWeek: z.array(weekCountSchema),
  checksPerWeek: z.array(weekCountSchema),
  testers: z.object({ total: count }),
  firmList: z.array(usageFirmSchema),
  /** Optional: a core from before flow events sends none. */
  flows: flowsReportSchema.optional(),
  /** Optional: a core from before website visits were counted sends none. */
  site: siteReportSchema.optional(),
});
export type UsageReportDto = z.infer<typeof usageReportSchema>;

// ---------------------------------------------------------------------------------------------
// Flow events (docs/flow-tracking-plan.md): which steps drivers reach and which fixed choices they make, so screens can be judged on
// what drivers do. Anonymous: a random session id made in memory when the app opens, never a driver, account or device id. Never a
// position, an address, a postcode, search text or three words: every event and every choice is from the fixed lists below, so
// anything else is refused rather than stored.

/** Each event, and the choices it may carry (`null`: none). Names stay the same when a screen is redesigned, so before and after line up. */
export const FLOW_EVENT_CHOICES = {
  walkthrough_step: ['1', '2', '3', '4', '5'],
  walkthrough_skipped: null,
  home_card_tapped: null,
  plan_opened: ['where_to', 'home_card', 'saved_place', 'replan', 'job'],
  vehicle_prompt_shown: null,
  vehicle_chosen: [
    'rigid-7-5',
    'rigid-18',
    'rigid-26',
    'rigid-32',
    'artic-44',
    'own_sizes',
    'existing',
  ],
  load_chosen: ['normal', 'hill_sensitive'],
  start_chosen: ['my_position', 'search', 'what3words', 'map', 'saved_place', 'yard'],
  destination_chosen: ['search', 'what3words', 'map', 'saved_place', 'sample'],
  route_options_shown: ['1', '2', '3', '4', '5', '6'],
  route_option_picked: [
    'fastest',
    'shortest',
    'toll_free',
    'fewer_hills',
    'cheapest',
    'avoids_weight_limit',
    'other',
  ],
  route_shown: null,
  trip_started: ['personal', 'job'],
  trip_ended: ['end_button', 'arrival_prompt', 'arrived_job', 'replan', 'offline_queue'],
  reminder_opened: null,
  /** The "Recommend us to your boss" screen opened, and its Send it to your boss button tapped (docs/modules.md, "Referrals"). */
  referral_opened: null,
  referral_shared: null,
} as const satisfies Record<string, readonly string[] | null>;

export type FlowEventName = keyof typeof FLOW_EVENT_CHOICES;
export const FLOW_EVENT_NAMES = Object.keys(FLOW_EVENT_CHOICES) as [
  FlowEventName,
  ...FlowEventName[],
];

/** The most events one request may carry; the app sends in batches. */
export const MAX_FLOW_EVENTS_PER_REQUEST = 50;

export const flowEventSchema = z
  .object({
    event: z.enum(FLOW_EVENT_NAMES),
    choice: z.string().max(40).optional(),
    /** When it happened, on the phone's clock. */
    at: z.iso.datetime(),
  })
  .superRefine((value, ctx) => {
    const allowed: readonly string[] | null = FLOW_EVENT_CHOICES[value.event];
    if (allowed === null && value.choice !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: `${value.event} carries no choice`,
        path: ['choice'],
      });
    }
    if (allowed !== null && (value.choice === undefined || !allowed.includes(value.choice))) {
      ctx.addIssue({
        code: 'custom',
        message: `not a choice for ${value.event}`,
        path: ['choice'],
      });
    }
  });
export type FlowEventDto = z.infer<typeof flowEventSchema>;

/** `POST /usage/flow-events` (a signed-in driver; who it was is not passed on or kept). Always answers `{ recorded }`. */
export const flowEventsRequestSchema = z.object({
  sessionId: z.uuid(),
  appVersion: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
  platform: z.enum(['ios', 'android']),
  /** The day the over-the-air update the phone runs was published (YYYY-MM-DD), so releases that keep the store version apart can be
   *  told apart. Absent from an app built before it was sent, and when the store build's own code is running. */
  updateDate: z.iso.date().optional(),
  events: z.array(flowEventSchema).min(1).max(MAX_FLOW_EVENTS_PER_REQUEST),
});
export type FlowEventsRequest = z.infer<typeof flowEventsRequestSchema>;

export const flowEventsResponseSchema = z.object({ recorded: z.number().int().min(0) });
export type FlowEventsResponse = z.infer<typeof flowEventsResponseSchema>;
