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

export const FEEDBACK_STATUSES = ['open', 'resolved', 'all'] as const;

/** `GET /staff/feedback` (WagonWise staff only): newest first. Open notes by default. */
export const listFeedbackQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).default('open'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

/** One note as staff read it: who sent it as a name or sign-in address (never the account id), and whether it is resolved. */
export const staffFeedbackNoteSchema = z.object({
  id: z.string(),
  message: z.string(),
  appVersion: z.string(),
  deviceInfo: z.string(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
  from: z.string().optional(),
});
export type StaffFeedbackNoteDto = z.infer<typeof staffFeedbackNoteSchema>;

export const listFeedbackResponseSchema = z.object({
  notes: z.array(staffFeedbackNoteSchema),
  /** How many notes there are in each state, whatever the filter. */
  counts: z.object({ open: z.number().int().min(0), resolved: z.number().int().min(0) }),
});
export type ListFeedbackResponse = z.infer<typeof listFeedbackResponseSchema>;

/** `PUT /staff/feedback/:id/resolved`: mark a note resolved, or reopen it. */
export const setFeedbackResolvedRequestSchema = z.object({ resolved: z.boolean() });
export type SetFeedbackResolvedRequest = z.infer<typeof setFeedbackResolvedRequestSchema>;

export const feedbackIdParamsSchema = z.object({ id: z.uuid() });

// ---------------------------------------------------------------------------------------------
// Market research contact (docs/company-account-states-scope.md): a person at a company may say WagonWise can contact them from time to
// time to ask for feedback. An option, never a condition of using WagonWise. The wording is here so the portal shows it and the server
// records which version the person saw; change the text and raise `version`, and nobody's earlier answer counts as agreeing to the new words.

export const RESEARCH_CONTACT_WORDING = {
  version: 1,
  text: 'WagonWise may contact me from time to time to ask for feedback, to help improve the system.',
  note: 'This is optional. Using WagonWise does not depend on it, and you can change your mind here at any time.',
} as const;

/** `GET /staff/research-contact` (a company's staff): their own answer, and the wording to show. `available` is false while the option is switched off. */
export const researchContactSchema = z.object({
  available: z.boolean(),
  /** Their latest answer to the current wording; null if they have never answered it (an answer to older wording does not count). */
  agreed: z.boolean().nullable(),
  /** When they answered, for the latest answer; null if never. */
  at: z.iso.datetime().nullable(),
  /** The wording that applies now. */
  version: z.number().int().min(1),
  text: z.string(),
  note: z.string(),
});
export type ResearchContactDto = z.infer<typeof researchContactSchema>;

/** `PUT /staff/research-contact`: `version` is the wording they were shown, so what is stored is what they saw. */
export const setResearchContactRequestSchema = z.object({
  agreed: z.boolean(),
  version: z.number().int().min(1),
});
export type SetResearchContactRequest = z.infer<typeof setResearchContactRequestSchema>;

/** `GET /staff/research-contacts` (WagonWise staff): the people whose latest answer, to the current wording, is yes. */
export const researchContactsResponseSchema = z.object({
  available: z.boolean(),
  version: z.number().int().min(1),
  people: z.array(
    z.object({
      name: z.string(),
      email: z.string(),
      company: z.string(),
      at: z.iso.datetime(),
    }),
  ),
});
export type ResearchContactsResponse = z.infer<typeof researchContactsResponseSchema>;
