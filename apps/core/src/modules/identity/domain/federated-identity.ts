import type { TaggedError } from '../../../shared/result.js';
import type { DriverId } from './driver.js';

export const SOCIAL_PROVIDERS = ['google', 'apple'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** What a provider's signed ID token says about the person, once it has been checked. */
export interface VerifiedIdentity {
  /** The provider's own stable id for this person. Never changes, unlike their email. */
  readonly subject: string;
  readonly email: string | undefined;
  /** Whether the provider says it has confirmed the email is theirs. Only a confirmed email may join an existing account. */
  readonly emailVerified: boolean;
}

/** A driver's Google or Apple sign-in. */
export interface FederatedIdentity {
  readonly provider: SocialProvider;
  readonly subject: string;
  readonly driverId: DriverId;
  readonly email: string | undefined;
  readonly createdAt: Date;
}

/** The ID token was not signed by that provider, is for another app, has expired, or is not a token at all. */
export type InvalidIdToken = TaggedError<'InvalidIdToken'>;
/** No client id is set for this provider, so its tokens cannot be checked. */
export type ProviderNotConfigured = TaggedError<'ProviderNotConfigured'>;
/** The provider did not confirm the email, so it cannot be used to find or make an account. */
export type EmailNotVerified = TaggedError<'EmailNotVerified'>;
