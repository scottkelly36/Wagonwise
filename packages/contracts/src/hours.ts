import { z } from 'zod';
import { brandedId } from './brand.js';

/** The wording version a driver agreed to; bumped when the consent wording changes. */
export const HOURS_WORDING_VERSION = 1;

export const hoursCompanyIdSchema = brandedId<'CompanyId'>();
export const hoursCompanyParamsSchema = z.object({ companyId: z.string().min(1) });

/** What is shared: whether the driver is driving, doing other work or on a break (not on a shift shares nothing). */
export const hoursStateSchema = z.enum(['driving', 'working', 'on_break']);
export type HoursStateDto = z.infer<typeof hoursStateSchema>;

/** `GET/PUT /staff/hours/companies/:companyId/settings`: the firm's switch (off until chosen). */
export const hoursSettingsSchema = z.object({ enabled: z.boolean() });
export type HoursSettingsDto = z.infer<typeof hoursSettingsSchema>;

/** `GET /hours/sharing`: for each company the driver drives for, whether the firm allows it and whether they share. */
export const hoursSharingRowSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  firmEnabled: z.boolean(),
  sharing: z.boolean(),
});
export type HoursSharingRowDto = z.infer<typeof hoursSharingRowSchema>;
export const hoursSharingResponseSchema = z.object({ companies: z.array(hoursSharingRowSchema) });

/** `PUT /hours/sharing/:companyId`. Turning it on records the wording version the driver was shown. */
export const setHoursSharingRequestSchema = z.object({
  sharing: z.boolean(),
  wordingVersion: z.number().int().min(1).optional(),
});
export type SetHoursSharingRequest = z.infer<typeof setHoursSharingRequestSchema>;

/** `PUT /hours/status`: the driver's current status. The server decides which company it goes to (the one they are on a
 *  job for) and refuses it unless both switches are on. */
export const reportHoursStatusRequestSchema = z.object({
  state: hoursStateSchema,
  /** Driving time left before the next break or limit, in whole minutes. */
  drivingLeftMin: z.number().int().min(0).max(24 * 60),
  /** Which comes first: a break, or a limit that needs a rest. */
  next: z.enum(['break', 'limit']),
});
export type ReportHoursStatusRequest = z.infer<typeof reportHoursStatusRequestSchema>;

export const hoursStatusSchema = z.object({
  driverId: z.string(),
  state: hoursStateSchema,
  drivingLeftMin: z.number().int().min(0),
  next: z.enum(['break', 'limit']),
  updatedAt: z.iso.datetime(),
});
export type HoursStatusDto = z.infer<typeof hoursStatusSchema>;

/** `GET /staff/hours/companies/:companyId/status`: the latest status of each driver sharing, on a job now. */
export const listHoursStatusResponseSchema = z.object({ statuses: z.array(hoursStatusSchema) });
