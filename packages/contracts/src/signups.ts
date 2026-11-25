import { z } from 'zod';

export const SIGNUP_ROLES = ['driver', 'company', 'both', 'other'] as const;
export const signupRoleSchema = z.enum(SIGNUP_ROLES);
export const FLEET_SIZES = ['1-5', '6-15', '16-40', '40+'] as const;
export const fleetSizeSchema = z.enum(FLEET_SIZES);

/**
 * `POST /signups` (public, from the landing page): someone registers their email to test WagonWise. `consent` must be true:
 * they ticked the box agreeing to be contacted about testing. `website` is a trap field a person never fills in; a bot does.
 */
export const signupRequestSchema = z.object({
  email: z.string().max(254),
  name: z.string().max(80).optional(),
  role: signupRoleSchema,
  company: z.string().max(120).optional(),
  fleetSize: fleetSizeSchema.optional(),
  consent: z.boolean(),
  website: z.string().max(200).optional(),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

/** `POST /signups/remove` (public): take an address off the list. */
export const removeSignupRequestSchema = z.object({ email: z.string().max(254) });

export const testerSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().optional(),
  role: signupRoleSchema,
  company: z.string().optional(),
  fleetSize: fleetSizeSchema.optional(),
  createdAt: z.iso.datetime(),
  /** When the standard invite email was sent, and the invite code that went with it. */
  invitedAt: z.iso.datetime().optional(),
  inviteCode: z.string().optional(),
  /** When the "out now" email was sent to them. */
  launchEmailedAt: z.iso.datetime().optional(),
  /** When a trial firm was made from this sign-up. */
  trialStartedAt: z.iso.datetime().optional(),
});
export type TesterDto = z.infer<typeof testerSchema>;

/** `GET /staff/signups` (WagonWise staff only): newest first. */
export const listTestersResponseSchema = z.object({
  testers: z.array(testerSchema),
  total: z.number().int(),
});

export type ListTestersResponse = z.infer<typeof listTestersResponseSchema>;

export const testerIdParamsSchema = z.object({ id: z.string().min(1) });

/** `POST /staff/signups/invite` (WagonWise staff only): send the standard invite email, each with an invite code of their own. */
export const sendInvitesRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  /** The closed-test opt-in link from Play Console, put in the email. */
  optInLink: z.url().max(300),
});
export type SendInvitesRequest = z.infer<typeof sendInvitesRequestSchema>;

export const INVITE_STATUSES = ['sent', 'already_invited', 'not_found', 'failed'] as const;
export const sendInvitesResponseSchema = z.object({
  results: z.array(z.object({ id: z.string(), status: z.enum(INVITE_STATUSES) })),
});
export type SendInvitesResponse = z.infer<typeof sendInvitesResponseSchema>;

/** An address a person is sent to by a button in an email: https only, so a slip cannot put a javascript: or http: link there. */
const httpsLinkSchema = z
  .url()
  .max(300)
  .refine((link) => link.startsWith('https://'), 'must start with https://');

/**
 * `POST /staff/signups/launch-email` (WagonWise staff only): send the "WagonWise is out now" email, with the two store links,
 * to each chosen tester. Nobody is sent it twice.
 */
export const sendLaunchEmailsRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  appStoreLink: httpsLinkSchema,
  playStoreLink: httpsLinkSchema,
});
export type SendLaunchEmailsRequest = z.infer<typeof sendLaunchEmailsRequestSchema>;

export const LAUNCH_EMAIL_STATUSES = ['sent', 'already_sent', 'not_found', 'failed'] as const;
export const sendLaunchEmailsResponseSchema = z.object({
  results: z.array(z.object({ id: z.string(), status: z.enum(LAUNCH_EMAIL_STATUSES) })),
});
export type SendLaunchEmailsResponse = z.infer<typeof sendLaunchEmailsResponseSchema>;

/** `POST /staff/signups/:id/start-trial` (WagonWise staff only): make the firm on a free trial and email its first admin the join link. */
export const startTrialRequestSchema = z.object({
  firmName: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(80).optional(),
});
export type StartTrialRequest = z.infer<typeof startTrialRequestSchema>;

export const START_TRIAL_STATUSES = [
  'started',
  'already_started',
  'not_found',
  'not_a_firm',
  'email_in_use',
] as const;
export const startTrialResponseSchema = z.object({
  status: z.enum(START_TRIAL_STATUSES),
  companyId: z.string().optional(),
  /** How many vehicles the new company's plan covers; 0 when none could be set (raise it on the Plans page). */
  vehicles: z.number().int().optional(),
  /** False when the email with the join link could not be sent; `inviteToken` is then given so the owner can send the link. */
  emailed: z.boolean().optional(),
  inviteToken: z.string().optional(),
});
export type StartTrialResponse = z.infer<typeof startTrialResponseSchema>;

/**
 * `POST /staff/trial/preview` (public): what a firm's trial link is for, before it presses the button. The link is the secret, so
 * nothing else is asked. `valid` is false for a link that is wrong, expired or never existed (the answer never says which).
 */
export const trialLinkRequestSchema = z.object({ token: z.string().min(20).max(200) });
export const trialLinkPreviewSchema = z.object({
  valid: z.boolean(),
  /** The trial was already started from this link. */
  started: z.boolean().optional(),
  /** The registration had no firm name, so the page asks for one. */
  needsCompany: z.boolean().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
});
export type TrialLinkPreview = z.infer<typeof trialLinkPreviewSchema>;

/**
 * `POST /staff/trial/start` (public): the firm presses "Start my trial". `company` is only needed when the registration had no firm name.
 * `waiting` means the firm is not turned away but the owner will start it (a daily limit, or another firm from the same domain).
 */
export const trialStartRequestSchema = z.object({
  token: z.string().min(20).max(200),
  company: z.string().trim().min(1).max(120).optional(),
});
export const TRIAL_START_STATUSES = [
  'started',
  'waiting',
  'already_started',
  'invalid',
  'needs_company',
  'email_in_use',
] as const;
export const trialStartResponseSchema = z.object({ status: z.enum(TRIAL_START_STATUSES) });
export type TrialStartResponse = z.infer<typeof trialStartResponseSchema>;
