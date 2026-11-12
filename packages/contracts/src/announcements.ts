import { z } from 'zod';

export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 600;

/**
 * A note from WagonWise to its drivers: what has changed in the app. Written by WagonWise staff in the portal; the driver app shows the
 * newest one once, as "What's new", and (when the staff member chose to) also sends it as a notification (stage 2).
 */
export const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(ANNOUNCEMENT_TITLE_MAX),
  /** Plain text. A line break starts a new point. */
  body: z.string().min(1).max(ANNOUNCEMENT_BODY_MAX),
  publishedAt: z.iso.datetime(),
});
export type AnnouncementDto = z.infer<typeof announcementSchema>;

export const createAnnouncementRequestSchema = z.object({
  title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX),
  body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
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
