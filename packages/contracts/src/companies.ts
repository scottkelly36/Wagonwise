import { z } from 'zod';
import { brandedId } from './brand.js';

export const companyIdSchema = brandedId<'CompanyId'>();
export type CompanyId = z.infer<typeof companyIdSchema>;

/** Whether a company may use WagonWise (docs/company-account-states-scope.md): on a free trial, paying, overdue (in the grace period) or
 *  paused (staff can read but not change anything; the account and its data stay). */
export const accountStatusSchema = z.enum(['trial', 'active', 'overdue', 'paused']);
export type AccountStatusDto = z.infer<typeof accountStatusSchema>;

export const companySchema = z.object({
  id: companyIdSchema,
  name: z.string(),
  createdAt: z.iso.datetime(),
  /** For the admin list. Optional: a core from before account states sends none. */
  accountStatus: accountStatusSchema.optional(),
  trialEndsOn: z.string().nullable().optional(),
  hold: z.boolean().optional(),
});
export type CompanyDto = z.infer<typeof companySchema>;

/** `id` is client-generated, same offline-queue-idempotency reasoning as every other
 *  create-request schema in this package (decision 62) — though this one's always created from
 *  an always-online admin dashboard, not an offline driver queue, so the reasoning is really just
 *  consistency, not a genuine idempotency need here. */
export const createCompanyRequestSchema = z.object({
  id: companyIdSchema,
  name: z.string().min(1),
});
export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/** How long a company's proof-of-delivery photos are kept, in months. The company chooses (it is the controller of
 *  its delivery records); the default is 12. */
export const PHOTO_RETENTION_MONTHS_MIN = 1;
export const PHOTO_RETENTION_MONTHS_MAX = 120;
export const companySettingsSchema = z.object({
  photoRetentionMonths: z
    .number()
    .int()
    .min(PHOTO_RETENTION_MONTHS_MIN)
    .max(PHOTO_RETENTION_MONTHS_MAX),
});
export type CompanySettingsDto = z.infer<typeof companySettingsSchema>;
/** `PUT /staff/companies/:id/settings` takes the same fields. */
export const updateCompanySettingsRequestSchema = companySettingsSchema;
export const companySettingsParamsSchema = z.object({ id: companyIdSchema });

/** A company's account state as WagonWise staff see it, with the owner's note and the "never pause" hold. */
export const accountStateSchema = z.object({
  companyId: companyIdSchema,
  status: accountStatusSchema,
  /** The UK day the free period ends (`YYYY-MM-DD`); null when not on a trial. */
  trialEndsOn: z.string().nullable(),
  overdueSince: z.iso.datetime().nullable(),
  pausedAt: z.iso.datetime().nullable(),
  note: z.string(),
  hold: z.boolean(),
});
export type AccountStateDto = z.infer<typeof accountStateSchema>;

/** What a company's own staff see of its state: no note and no hold, which are the owner's. `GET /staff/company/account-state`. */
export const ownAccountStateSchema = accountStateSchema.omit({
  note: true,
  hold: true,
  overdueSince: true,
});
export type OwnAccountStateDto = z.infer<typeof ownAccountStateSchema>;

/**
 * `PUT /staff/companies/:id/account-state` (WagonWise staff only): move a company to a state. A trial needs its end day; when it is
 * left out the setting's default length from today is used. `hold` is left as it is when not sent.
 */
export const setAccountStateRequestSchema = z.object({
  status: accountStatusSchema,
  trialEndsOn: z.iso.date().nullable().optional(),
  hold: z.boolean().optional(),
  note: z.string().max(500).default(''),
});
export type SetAccountStateRequest = z.infer<typeof setAccountStateRequestSchema>;

/** The emails a company is sent about its account: the free period ending (about 14 and 7 days out), payment overdue (and a reminder), paused. */
export const accountEmailKindSchema = z.enum([
  'trial_14',
  'trial_7',
  'overdue',
  'overdue_week',
  'paused',
  'resumed',
]);
export type AccountEmailKindDto = z.infer<typeof accountEmailKindSchema>;

/**
 * `POST /staff/companies/:id/account-emails` (WagonWise staff only). `company`: write to the company's billing people now, if it is in the
 * state the email is about. `me`: a test copy of the wording to the signed-in staff member, nothing logged, nobody else written to.
 */
export const sendAccountEmailRequestSchema = z.object({
  kind: accountEmailKindSchema,
  to: z.enum(['company', 'me']),
});
export type SendAccountEmailRequest = z.infer<typeof sendAccountEmailRequestSchema>;

export const sendAccountEmailResponseSchema = z.object({
  /** People written to. */
  sent: z.number().int().min(0),
  /** True when that email had already gone for this occasion, so nothing was sent now. */
  alreadySent: z.boolean(),
});
export type SendAccountEmailResponse = z.infer<typeof sendAccountEmailResponseSchema>;

/** Whether the automatic rules run: not at all, emails and "overdue" only (nothing is ever paused), or in full (an overdue company is paused after its grace period). */
export const accountAutomationSchema = z.enum(['off', 'no_pause', 'full']);
export type AccountAutomationDto = z.infer<typeof accountAutomationSchema>;

/** `POST /staff/account-rules/run` (WagonWise staff only): what one pass of the automatic rules did. */
export const accountRulesRunSchema = z.object({
  moved: z.number().int().min(0),
  emailed: z.number().int().min(0),
  nobodyToWrite: z.number().int().min(0),
  failed: z.number().int().min(0),
});
export type AccountRulesRunDto = z.infer<typeof accountRulesRunSchema>;

/** `GET/PUT /staff/account-settings` (WagonWise staff only): the free period for new companies, the grace period, and whether the automatic rules run. */
export const accountSettingsSchema = z.object({
  defaultTrialDays: z.number().int().min(1).max(365),
  graceDays: z.number().int().min(0).max(90),
  automation: accountAutomationSchema,
});
export type AccountSettingsDto = z.infer<typeof accountSettingsSchema>;

/**
 * `GET /staff/companies/:id/account-history` (WagonWise staff only): the latest moves between states (by a person, or automatically) and
 * the latest emails sent to the company, newest first.
 */
export const accountHistorySchema = z.object({
  moves: z.array(
    z.object({
      from: accountStatusSchema.nullable(),
      to: accountStatusSchema,
      /** True when the rules made the move, false when a person did. */
      automatic: z.boolean(),
      note: z.string(),
      at: z.iso.datetime(),
    }),
  ),
  emails: z.array(
    z.object({
      kind: accountEmailKindSchema,
      /** The occasion: the day the free period ends, or the day it went overdue or was paused. */
      occasion: z.string(),
      at: z.iso.datetime(),
      recipients: z.number().int().min(0),
    }),
  ),
});
export type AccountHistoryDto = z.infer<typeof accountHistorySchema>;

export const listCompaniesResponseSchema = z.object({
  companies: z.array(companySchema),
});
export type ListCompaniesResponse = z.infer<typeof listCompaniesResponseSchema>;

/** The shape of a domain error body every companies route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status) — mirrors identity's, hazards' and every other module's own
 *  error response schema. */
export const companiesErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type CompaniesErrorResponse = z.infer<typeof companiesErrorResponseSchema>;
