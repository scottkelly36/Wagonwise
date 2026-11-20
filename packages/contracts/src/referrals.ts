import { z } from 'zod';

/**
 * Drivers recommending WagonWise to the firm they drive for (docs/modules.md, "Referrals"). Each driver has a short code; when a firm
 * joins, WagonWise staff record the code against it; once the firm has paid its first bill the driver is due a gift card, claims it
 * with an email address given for that alone, and staff send it.
 */
export const REFERRAL_REWARD_POUNDS = 25;

/** "WW-" and six letters or digits, with none that are easy to confuse (no 0, O, 1, I or L). Typed in any case. */
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^WW-[A-HJKMNP-Z2-9]{6}$/);

/**
 * signed_up: the firm has joined (its free period); reward_due: it has paid its first bill; claimed: the driver has said where to send
 * the gift card; sent: WagonWise has sent it; void: does not qualify (one lorry, the driver's own firm, a duplicate).
 */
export const referralStatusSchema = z.enum(['signed_up', 'reward_due', 'claimed', 'sent', 'void']);
export type ReferralStatus = z.infer<typeof referralStatusSchema>;

export const myReferralSchema = z.object({
  id: z.uuid(),
  firmName: z.string(),
  status: referralStatusSchema,
  createdAt: z.iso.datetime(),
});
export type MyReferralDto = z.infer<typeof myReferralSchema>;

/** `GET /referrals/me`: the driver's own code (made on first ask) and the firms they have recommended. */
export const myReferralsResponseSchema = z.object({
  code: z.string(),
  rewardPounds: z.number().int(),
  referrals: z.array(myReferralSchema),
});
export type MyReferralsResponse = z.infer<typeof myReferralsResponseSchema>;

export const referralIdParamsSchema = z.object({ id: z.uuid() });

/** `POST /referrals/:id/claim`: where to send a gift card that is due. Used for that alone. */
export const claimRewardRequestSchema = z.object({ email: z.email().max(200) });
export type ClaimRewardRequest = z.infer<typeof claimRewardRequestSchema>;

export const staffReferralSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  /** The driver's name, or the sign-in the office sees, as elsewhere in the portal. */
  driverLabel: z.string().nullable(),
  firmName: z.string(),
  status: referralStatusSchema,
  /** Only once the driver has claimed the reward. */
  rewardEmail: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type StaffReferralDto = z.infer<typeof staffReferralSchema>;

export const staffReferralListResponseSchema = z.object({ referrals: z.array(staffReferralSchema) });
export type StaffReferralListResponse = z.infer<typeof staffReferralListResponseSchema>;

/** `POST /staff/referrals`: a firm has joined and named a driver's code. */
export const createReferralRequestSchema = z.object({
  code: referralCodeSchema,
  firmName: z.string().trim().min(1).max(120),
});
export type CreateReferralRequest = z.infer<typeof createReferralRequestSchema>;

/** What staff may set: the firm has paid (reward_due), the gift card went (sent), or it does not qualify (void). */
export const setReferralStatusRequestSchema = z.object({
  status: z.enum(['reward_due', 'sent', 'void']),
});
export type SetReferralStatusRequest = z.infer<typeof setReferralStatusRequestSchema>;

export const referralCodeParamsSchema = z.object({ code: referralCodeSchema });

/** `GET /staff/referrals/codes/:code`: whose code it is, so staff can check before recording it. */
export const referralCodeLookupResponseSchema = z.object({
  code: z.string(),
  driverLabel: z.string().nullable(),
});
export type ReferralCodeLookupResponse = z.infer<typeof referralCodeLookupResponseSchema>;
