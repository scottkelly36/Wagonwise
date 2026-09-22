import type { TaggedError } from '../../../shared/result.js';

/**
 * Errors shared by request-otp.ts and verify-otp.ts — both check the invite code (request
 * validates without redeeming, verify redeems), so both can report either of these.
 */
export type InviteCodeRequired = TaggedError<'InviteCodeRequired'>;
export type InvalidInviteCode = TaggedError<'InvalidInviteCode'>;
