import type { TaggedError } from '../../../shared/result.js';

/**
 * Errors shared by request-otp.ts and verify-otp.ts — both check the invite code (request
 * validates without redeeming, verify redeems), so both can report either of these.
 */
export type InviteCodeRequired = TaggedError<'InviteCodeRequired'>;
export type InvalidInviteCode = TaggedError<'InvalidInviteCode'>;

/** The sign-in code could not be delivered (the SMS or email provider refused or was unreachable). `cause`
 *  is for the log only and never sent to the caller. */
export type CodeNotSent = TaggedError<'CodeNotSent'> & { readonly cause: unknown };

/** Only reachable if `request.driverId` (a verified token's own claim) names a driver that
 *  somehow no longer exists — a data-integrity bug, not a request shape a driver can trigger
 *  (`give-consent.ts`, `delete-account.ts`). */
export type DriverNotFound = TaggedError<'DriverNotFound'>;
