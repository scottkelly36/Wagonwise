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

/**
 * `GET /staff/usage/:section` (WagonWise staff only): how the app is being used, one view at a time so the page only waits for the
 * view it is showing (the sections are separate sets of queries and separate requests). Counts only: no driver is named. "Active"
 * means a session was used (a sign-in or a refresh) in the window.
 */
export const USAGE_SECTIONS = [
  'overview',
  'drivers',
  'activity',
  'firms',
  'flows',
  'site',
  'portal',
] as const;
export type UsageSectionName = (typeof USAGE_SECTIONS)[number];
export const usageSectionParamsSchema = z.object({ section: z.enum(USAGE_SECTIONS) });

const generated = { generatedAt: z.string() };

/** The headline figures. */
export const usageOverviewSchema = z.object({
  ...generated,
  /** Driver accounts that still exist: an account that was deleted is not counted. */
  drivers: activitySchema,
  /** Driver accounts that were deleted. */
  deletedDrivers: count,
  staff: activitySchema,
  firms: z.object({ total: count, activeThisWeek: count }),
  devices: count,
  testers: count,
  tripsRunningNow: count,
  tripsToday: count,
  funnel: funnelSchema,
});
export type UsageOverviewDto = z.infer<typeof usageOverviewSchema>;

/** New drivers and whether they come back. */
export const usageDriversSchema = z.object({
  ...generated,
  /** The last 14 UK days, oldest first, by the day an account was made. Days with no new drivers are included. */
  newDriversByDay: z.array(cohortDaySchema),
  /** The last 8 UK weeks of new drivers, oldest first, weeks with none included. */
  retentionByWeek: z.array(retentionWeekSchema),
});
export type UsageDriversDto = z.infer<typeof usageDriversSchema>;

/** Trips, jobs and checks over the last weeks. */
export const usageActivitySchema = z.object({
  ...generated,
  /** The last 14 UK days, oldest first, days with none included. */
  tripsPerDay: z.array(dayCountSchema),
  /** The last 8 UK weeks (Monday starts), oldest first. */
  jobsCreatedPerWeek: z.array(weekCountSchema),
  jobsDeliveredPerWeek: z.array(weekCountSchema),
  checksPerWeek: z.array(weekCountSchema),
});
export type UsageActivityDto = z.infer<typeof usageActivitySchema>;

export const usageFirmsSchema = z.object({ ...generated, firmList: z.array(usageFirmSchema) });
export type UsageFirmsDto = z.infer<typeof usageFirmsSchema>;

export const usageFlowsSchema = flowsReportSchema.extend(generated);
export type UsageFlowsDto = z.infer<typeof usageFlowsSchema>;

export const usageSiteSchema = siteReportSchema.extend(generated);
export type UsageSiteDto = z.infer<typeof usageSiteSchema>;

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

// ---------------------------------------------------------------------------------------------
// Portal events (docs/company-account-states-scope.md, "Portal tracking"): which pages a company's staff open and where the forms in the
// dashboard trip them up, so the portal can be improved and a firm that has stopped part-way can be rung. First party only. Names, never
// content: every page, form, field and kind of problem is from the fixed lists below, so anything else (a registration, a name, an address,
// a note, an email) is refused rather than stored. The company is kept; the person is not.

/** The pages of the portal a company's staff use (not WagonWise's own admin pages). */
export const PORTAL_PAGES = [
  'fleet_overview',
  'jobs',
  'live_trips',
  'fuel',
  'costs',
  'job_costs',
  'outlook',
  'places',
  'checks',
  'maintenance',
  'check_results',
  'defects',
  'audit_pack',
  'reports',
  'drivers',
  'vehicle_profiles',
  'guide',
  'users',
  'activity',
  'settings',
  'plan',
] as const;
export type PortalPage = (typeof PORTAL_PAGES)[number];

/** The forms that are tracked, and the fields of each that a problem can be about (`form`: the whole form, such as the server refusing it). */
export const PORTAL_FORM_FIELDS = {
  add_vehicle: ['name', 'height', 'width', 'length', 'weight', 'top_speed', 'form'],
  create_job: ['reference', 'stops', 'price', 'form'],
  invite_person: ['name', 'email', 'company', 'form'],
  invite_driver: ['identifier', 'form'],
} as const satisfies Record<string, readonly string[]>;
export type PortalForm = keyof typeof PORTAL_FORM_FIELDS;
export const PORTAL_FORMS = Object.keys(PORTAL_FORM_FIELDS) as [PortalForm, ...PortalForm[]];

/** What was wrong: never what was typed. */
export const PORTAL_PROBLEMS = [
  'required',
  'too_long',
  'not_a_number',
  'invalid',
  'capacity_reached',
  'not_allowed',
  'other',
] as const;
export type PortalProblem = (typeof PORTAL_PROBLEMS)[number];

const portalAt = z.iso.datetime();

export const portalEventSchema = z
  .discriminatedUnion('event', [
    z.object({ event: z.literal('page_viewed'), page: z.enum(PORTAL_PAGES), at: portalAt }),
    z.object({ event: z.literal('form_opened'), form: z.enum(PORTAL_FORMS), at: portalAt }),
    z.object({ event: z.literal('form_sent'), form: z.enum(PORTAL_FORMS), at: portalAt }),
    /** The form was left (the page changed or closed) after something was typed into it, and it was not sent. */
    z.object({ event: z.literal('form_left'), form: z.enum(PORTAL_FORMS), at: portalAt }),
    z.object({
      event: z.literal('form_error'),
      form: z.enum(PORTAL_FORMS),
      field: z.string().max(20),
      problem: z.enum(PORTAL_PROBLEMS),
      at: portalAt,
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.event !== 'form_error') return;
    const allowed: readonly string[] = PORTAL_FORM_FIELDS[value.form];
    if (!allowed.includes(value.field)) {
      ctx.addIssue({ code: 'custom', message: `not a field of ${value.form}`, path: ['field'] });
    }
  });
export type PortalEventDto = z.infer<typeof portalEventSchema>;

/** The most events one request may carry; the portal sends in batches. */
export const MAX_PORTAL_EVENTS_PER_REQUEST = 50;

/**
 * `POST /staff/usage/portal-events` (a signed-in staff member of a company; the company comes from who is signed in, never from the
 * request, and the person is not kept). Always answers `{ recorded }`. WagonWise's own staff are accepted and nothing is kept.
 */
export const portalEventsRequestSchema = z.object({
  /** Random, made in the browser when the portal opens, so one sitting can be followed. */
  sessionId: z.uuid(),
  events: z.array(portalEventSchema).min(1).max(MAX_PORTAL_EVENTS_PER_REQUEST),
});
export type PortalEventsRequest = z.infer<typeof portalEventsRequestSchema>;

export const portalEventsResponseSchema = z.object({ recorded: z.number().int().min(0) });
export type PortalEventsResponse = z.infer<typeof portalEventsResponseSchema>;

/** The portal's own usage (the `portal` section), from the events of the last 30 days. */
export const portalReportSchema = z.object({
  windowDays: z.number().int().min(0),
  /** Sittings (sessions) and the companies they came from. */
  sessions: z.number().int().min(0),
  firms: z.number().int().min(0),
  /** Every page, even one nobody opened (sessions that opened it). */
  pages: z.array(z.object({ page: z.enum(PORTAL_PAGES), sessions: z.number().int().min(0) })),
  /** Each tracked form: times opened, sent, left part-way, times it showed a problem, and the median seconds from opening to sending. */
  forms: z.array(
    z.object({
      form: z.enum(PORTAL_FORMS),
      opened: z.number().int().min(0),
      sent: z.number().int().min(0),
      left: z.number().int().min(0),
      errors: z.number().int().min(0),
      medianSecondsToSend: z.number().nullable(),
    }),
  ),
  /** The fields that cause the most problems, most first. */
  errorFields: z.array(
    z.object({
      form: z.enum(PORTAL_FORMS),
      field: z.string(),
      problem: z.enum(PORTAL_PROBLEMS),
      count: z.number().int().min(0),
    }),
  ),
  /** Companies made in the last 90 days that have not yet had a job: how far each got, and when they were last seen in the portal. */
  settingUp: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      createdAt: z.string(),
      vehicles: z.number().int().min(0),
      drivers: z.number().int().min(0),
      jobs: z.number().int().min(0),
      lastSeenAt: z.string().nullable(),
    }),
  ),
});
export type PortalReportDto = z.infer<typeof portalReportSchema>;
export const usagePortalSchema = portalReportSchema.extend(generated);
export type UsagePortalDto = z.infer<typeof usagePortalSchema>;
