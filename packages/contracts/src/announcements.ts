import { z } from 'zod';

export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 600;

/**
 * A note from WagonWise to its drivers: what has changed in the app. Written by WagonWise staff in the portal; the driver app shows the
 * newest one once, as "What's new", and (when the staff member chose to) it is also sent as a notification to the drivers who have not turned those off.
 */
export const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(ANNOUNCEMENT_TITLE_MAX),
  /** Plain text. A line break starts a new point. */
  body: z.string().min(1).max(ANNOUNCEMENT_BODY_MAX),
  publishedAt: z.iso.datetime(),
  /** When it was sent as a notification, and to how many phones (accepted by the push service). Absent when it was not sent. */
  pushedAt: z.iso.datetime().optional(),
  pushedTo: z.number().int().min(0).optional(),
});
export type AnnouncementDto = z.infer<typeof announcementSchema>;

export const createAnnouncementRequestSchema = z.object({
  title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX),
  body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
  /** Also send it as a notification to every driver who has not turned them off. Refused if one was sent in the last three days. */
  push: z.boolean().optional(),
});
export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;

export const announcementIdParamsSchema = z.object({ id: z.uuid() });

/** Newest first. */
export const announcementListResponseSchema = z.object({
  announcements: z.array(announcementSchema),
});
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>;

/** For the driver app: the newest announcement, or `null` when there has never been one. */
export const latestAnnouncementResponseSchema = z.object({
  announcement: announcementSchema.nullable(),
});
export type LatestAnnouncementResponse = z.infer<typeof latestAnnouncementResponseSchema>;

/** What publishing answers: the note, with `pushFailed` set when it was saved but the notification could not be sent. */
export const publishAnnouncementResponseSchema = announcementSchema.extend({
  pushFailed: z.boolean().optional(),
});
export type PublishAnnouncementResponse = z.infer<typeof publishAnnouncementResponseSchema>;

/** A driver's choice about notifications from WagonWise about what has changed. On unless they turn it off. */
export const announcementPreferenceSchema = z.object({ pushes: z.boolean() });
export type AnnouncementPreference = z.infer<typeof announcementPreferenceSchema>;
