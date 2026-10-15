import { z } from 'zod';

/** The email events worth waking the owner for: a sign-in code that did not arrive. Resend sends others (sent, delivered,
 *  opened) that the driver BFF acknowledges and ignores. */
export const EMAIL_PROBLEM_TYPES = [
  'email.failed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
] as const;
export const emailProblemTypeSchema = z.enum(EMAIL_PROBLEM_TYPES);
export type EmailProblemType = z.infer<typeof emailProblemTypeSchema>;

/**
 * `POST /email-events` (BFF to core): one email that did not get through, as the BFF read it from Resend's signed webhook.
 * `recipients` are the addresses it was sent to; core masks them before they reach a log or an alert. `emailId` is Resend's
 * own id, so the full detail can be found in the Resend dashboard.
 */
export const emailProblemSchema = z.object({
  type: emailProblemTypeSchema,
  emailId: z.string().max(100),
  recipients: z.array(z.string().max(254)).max(50),
  reason: z.string().max(500).optional(),
});
export type EmailProblem = z.infer<typeof emailProblemSchema>;
