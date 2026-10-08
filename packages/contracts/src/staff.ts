import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';

/**
 * Staff accounts for the dashboard (P2-M1, docs/history/p2-m1-organisations-auth.md): separate
 * from drivers, signed in with email + password + a second factor, and allowed only what their
 * privileges say. Shared by core, the staff BFF and the dashboard.
 */

export const staffIdSchema = brandedId<'StaffId'>();
export type StaffId = z.infer<typeof staffIdSchema>;

/**
 * `platform`: works for WagonWise, not tied to any company, can act in every company (support,
 * creating companies, hazard admin). `fleet`: works for one haulage company, limited to it and to
 * their privileges.
 */
export const STAFF_KINDS = ['platform', 'fleet'] as const;
export const staffKindSchema = z.enum(STAFF_KINDS);
export type StaffKind = z.infer<typeof staffKindSchema>;

/**
 * The fixed list of switches a fleet user can have (user's call, 2026-09-28). WagonWise defines
 * them; a company can only turn them on or off for its own staff, never invent new ones. Adding
 * one later is cheap; renaming or removing one after firms use it needs a data migration.
 *
 * - `manage_users`: invite colleagues, change their privileges, remove them ("manager").
 * - `manage_fleet`: add, edit and remove the company's vehicles.
 * - `dispatch`: create, assign and cancel jobs.
 * - `view_live_map`: see where the company's trucks are during active jobs.
 * - `view_reports`: see reports and export CSVs.
 * - `manage_billing`: see and change the company's subscription.
 */
export const PRIVILEGES = [
  'manage_users',
  'manage_fleet',
  'dispatch',
  'view_live_map',
  'view_reports',
  'manage_billing',
] as const;
export const privilegeSchema = z.enum(PRIVILEGES);
export type Privilege = z.infer<typeof privilegeSchema>;

/**
 * Ready-made groups for the invite form, so nobody has to think about individual switches. Only
 * a convenience: what's stored on the account is the resulting list of privileges.
 */
export const PRIVILEGE_PRESETS = {
  owner: PRIVILEGES,
  dispatcher: ['manage_fleet', 'dispatch', 'view_live_map', 'view_reports'],
  viewer: ['view_live_map', 'view_reports'],
} as const satisfies Record<string, readonly Privilege[]>;
export type PrivilegePreset = keyof typeof PRIVILEGE_PRESETS;

/** How a staff member proves it's them after their password (user's call, 2026-09-28): an
 *  authenticator app, or a code sent by text or email through the same services drivers use. */
export const SECOND_FACTOR_METHODS = ['totp', 'sms', 'email'] as const;
export const secondFactorMethodSchema = z.enum(SECOND_FACTOR_METHODS);
export type SecondFactorMethod = z.infer<typeof secondFactorMethodSchema>;

/** Passwords: length over complexity rules. 12 characters minimum, 200 maximum so a hashing
 *  request can't be used to make the server do unbounded work. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** UK mobile in international form (+44…), the only numbers the SMS provider is set up for. */
export const ukMobileSchema = z.string().regex(/^\+447\d{9}$/);

/** No duplicates in a privilege list. Order doesn't matter. */
const privilegeListSchema = z
  .array(privilegeSchema)
  .refine((list) => new Set(list).size === list.length, { message: 'duplicate privilege' });

export const staffAccountSchema = z
  .object({
    id: staffIdSchema,
    kind: staffKindSchema,
    email: z.email(),
    name: z.string().min(1),
    /** Present for fleet users, absent for platform staff. */
    companyId: companyIdSchema.optional(),
    /** Fleet users only. Platform staff can do everything, so this is always empty for them. */
    privileges: privilegeListSchema,
    secondFactorMethod: secondFactorMethodSchema,
    createdAt: z.iso.datetime(),
  })
  .refine((s) => (s.kind === 'fleet') === (s.companyId !== undefined), {
    message: 'fleet users need a companyId; platform staff must not have one',
    path: ['companyId'],
  })
  .refine((s) => s.kind === 'fleet' || s.privileges.length === 0, {
    message: 'platform staff have no per-company privileges',
    path: ['privileges'],
  });
export type StaffAccountDto = z.infer<typeof staffAccountSchema>;

export const listStaffResponseSchema = z.object({
  staff: z.array(staffAccountSchema),
});
export type ListStaffResponse = z.infer<typeof listStaffResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Sign-in: password first, then the second factor. Tokens only come back after both.
// ---------------------------------------------------------------------------------------------

export const staffSignInRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type StaffSignInRequest = z.infer<typeof staffSignInRequestSchema>;

/** A correct password never signs anyone in on its own: it opens a short-lived challenge. For
 *  `sms`/`email` a code has just been sent; for `totp` the authenticator app already shows one.
 *  A wrong password gets the same generic error as an unknown email (no account enumeration). */
export const staffSignInResponseSchema = z.object({
  challengeId: z.uuid(),
  method: secondFactorMethodSchema,
  expiresAt: z.iso.datetime(),
});
export type StaffSignInResponse = z.infer<typeof staffSignInResponseSchema>;

/** `code` is the 6-digit code, or one of the account's single-use recovery codes if the
 *  second-factor device is lost. */
export const staffVerifySecondFactorRequestSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().min(6).max(32),
});
export type StaffVerifySecondFactorRequest = z.infer<typeof staffVerifySecondFactorRequestSchema>;

export const staffTokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  staff: staffAccountSchema,
});
export type StaffTokensResponse = z.infer<typeof staffTokensResponseSchema>;

export const staffRefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});
export type StaffRefreshTokenRequest = z.infer<typeof staffRefreshTokenRequestSchema>;

export const staffRefreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type StaffRefreshTokenResponse = z.infer<typeof staffRefreshTokenResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Invites: a manager (their own company) or platform staff (any company, or a platform invite)
// invites someone by email; they set a password and a second factor when they accept.
// ---------------------------------------------------------------------------------------------

export const staffInviteIdSchema = brandedId<'StaffInviteId'>();
export type StaffInviteId = z.infer<typeof staffInviteIdSchema>;

export const createStaffInviteRequestSchema = z
  .object({
    kind: staffKindSchema,
    email: z.email(),
    name: z.string().min(1),
    /** Required for a fleet invite. A manager's own company is enforced by core regardless of
     *  what's sent here. */
    companyId: companyIdSchema.optional(),
    privileges: privilegeListSchema,
  })
  .refine((i) => (i.kind === 'fleet') === (i.companyId !== undefined), {
    message: 'fleet invites need a companyId; platform invites must not have one',
    path: ['companyId'],
  })
  .refine((i) => i.kind === 'fleet' || i.privileges.length === 0, {
    message: 'platform invites carry no per-company privileges',
    path: ['privileges'],
  });
export type CreateStaffInviteRequest = z.infer<typeof createStaffInviteRequestSchema>;

export const staffInviteSchema = z.object({
  id: staffInviteIdSchema,
  kind: staffKindSchema,
  email: z.email(),
  name: z.string(),
  companyId: companyIdSchema.optional(),
  privileges: z.array(privilegeSchema),
  expiresAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
});
export type StaffInviteDto = z.infer<typeof staffInviteSchema>;

/** `inviteToken` goes in the link the inviter sends (`/join?token=…` on the dashboard). It's
 *  returned this once and never again: only its hash is stored. */
export const createStaffInviteResponseSchema = z.object({
  invite: staffInviteSchema,
  inviteToken: z.string().min(1),
  /** Whether the invitation was emailed to them. When false the inviter shares the link by hand. */
  emailed: z.boolean().default(false),
});
export type CreateStaffInviteResponse = z.infer<typeof createStaffInviteResponseSchema>;

/** Step 1 of accepting: the emailed invite token, a password, and which second factor to use.
 *  `phone` is required for `sms` and not allowed otherwise. */
export const acceptStaffInviteRequestSchema = z
  .object({
    inviteToken: z.string().min(1),
    password: passwordSchema,
    secondFactorMethod: secondFactorMethodSchema,
    phone: ukMobileSchema.optional(),
  })
  .refine((a) => (a.secondFactorMethod === 'sms') === (a.phone !== undefined), {
    message: 'a phone number is needed for text-message codes, and only for those',
    path: ['phone'],
  });
export type AcceptStaffInviteRequest = z.infer<typeof acceptStaffInviteRequestSchema>;

/** For `totp`, `totpUri` is the otpauth:// link to show as a QR code. For `sms`/`email` a code
 *  has just been sent. Either way the account isn't active until step 2 proves the factor works. */
export const acceptStaffInviteResponseSchema = z.object({
  enrolmentId: z.uuid(),
  secondFactorMethod: secondFactorMethodSchema,
  totpUri: z.string().startsWith('otpauth://totp/').optional(),
});
export type AcceptStaffInviteResponse = z.infer<typeof acceptStaffInviteResponseSchema>;

/** Step 2: the first code from the chosen factor. Success activates the account, signs the
 *  person in, and returns recovery codes, shown once and never again. */
export const confirmStaffEnrolmentRequestSchema = z.object({
  enrolmentId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
});
export type ConfirmStaffEnrolmentRequest = z.infer<typeof confirmStaffEnrolmentRequestSchema>;

export const confirmStaffEnrolmentResponseSchema = staffTokensResponseSchema.extend({
  recoveryCodes: z.array(z.string()).length(10),
});
export type ConfirmStaffEnrolmentResponse = z.infer<typeof confirmStaffEnrolmentResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Managing people: managers within their own company, platform staff anywhere.
// ---------------------------------------------------------------------------------------------

/** Replaces the whole list (not a merge). Core refuses to grant a privilege the caller doesn't
 *  hold, and refuses to leave a company without anyone who has `manage_users`. */
export const setStaffPrivilegesRequestSchema = z.object({
  privileges: privilegeListSchema,
});
export type SetStaffPrivilegesRequest = z.infer<typeof setStaffPrivilegesRequestSchema>;

/** No `companyId`: everyone (WagonWise admins only). */
export const listStaffQuerySchema = z.object({
  companyId: z.uuid().optional(),
});
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;

export const staffIdParamsSchema = z.object({
  id: z.uuid(),
});
export type StaffIdParams = z.infer<typeof staffIdParamsSchema>;

export const staffErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type StaffErrorResponse = z.infer<typeof staffErrorResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Audit log (P2-M1.11): who did what, to which company, when. Same visibility as the users list.
// ---------------------------------------------------------------------------------------------

export const STAFF_AUDIT_ACTIONS = [
  'invite_created',
  'staff_joined',
  'signed_in',
  'sign_in_failed',
  'second_factor_failed',
  'privileges_changed',
  'staff_removed',
  'company_settings_changed',
] as const;
export const staffAuditActionSchema = z.enum(STAFF_AUDIT_ACTIONS);
export type StaffAuditAction = z.infer<typeof staffAuditActionSchema>;

export const staffAuditEntrySchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime(),
  action: staffAuditActionSchema,
  /** Absent when nobody was signed in (a failed sign-in). */
  actorId: staffIdSchema.optional(),
  /** Absent for entries about WagonWise staff accounts. */
  companyId: companyIdSchema.optional(),
  targetId: staffIdSchema.optional(),
  /** e.g. `{ before: [...], after: [...] }` for a privilege change, `{ method }` for a sign-in. */
  details: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});
export type StaffAuditEntryDto = z.infer<typeof staffAuditEntrySchema>;

/** Newest first, the latest 200. */
export const listStaffAuditResponseSchema = z.object({
  entries: z.array(staffAuditEntrySchema),
});
export type ListStaffAuditResponse = z.infer<typeof listStaffAuditResponseSchema>;
