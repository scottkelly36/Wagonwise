import { z } from 'zod';
import { brandedId } from './brand.js';
import { driverIdSchema } from './identity.js';

export const feedbackNoteIdSchema = brandedId<'FeedbackNoteId'>();
export type FeedbackNoteId = z.infer<typeof feedbackNoteIdSchema>;

/** No `driverId` field (matches every other create-request schema in this package) — the sender
 *  is whoever the caller's access token says they are, taken from the verified token, not this
 *  schema (decision 1). */
export const submitFeedbackRequestSchema = z.object({
  message: z.string().min(1),
  appVersion: z.string().min(1),
  deviceInfo: z.string().min(1),
});
export type SubmitFeedbackRequest = z.infer<typeof submitFeedbackRequestSchema>;

export const feedbackNoteSchema = z.object({
  id: feedbackNoteIdSchema,
  driverId: driverIdSchema,
  message: z.string(),
  appVersion: z.string(),
  deviceInfo: z.string(),
  createdAt: z.iso.datetime(),
});
export type FeedbackNoteDto = z.infer<typeof feedbackNoteSchema>;

/** The shape of a domain error body every feedback route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status; this describes what rides along with it) — mirrors every
 *  other module's own error response schema. */
export const feedbackErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type FeedbackErrorResponse = z.infer<typeof feedbackErrorResponseSchema>;
