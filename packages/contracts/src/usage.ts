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
 * `GET /staff/usage` (WagonWise staff only): how the app is being used. Counts only: no driver is named. "Active" means a
 * session was used (a sign-in or a refresh) in the window.
 */
export const usageReportSchema = z.object({
  generatedAt: z.string(),
  drivers: activitySchema,
  staff: activitySchema,
  firms: z.object({ total: count, activeThisWeek: count }),
  devices: z.object({ total: count }),
  tripsRunningNow: count,
  /** The last 14 UK days, oldest first, days with none included. */
  tripsPerDay: z.array(dayCountSchema),
  /** The last 8 UK weeks (Monday starts), oldest first. */
  jobsCreatedPerWeek: z.array(weekCountSchema),
  jobsDeliveredPerWeek: z.array(weekCountSchema),
  checksPerWeek: z.array(weekCountSchema),
  testers: z.object({ total: count }),
  firmList: z.array(usageFirmSchema),
});
export type UsageReportDto = z.infer<typeof usageReportSchema>;
