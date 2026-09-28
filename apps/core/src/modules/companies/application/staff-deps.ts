import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { CodeSender } from './ports/code-sender.js';
import type { PasswordHasher } from './ports/password-hasher.js';
import type { RandomCodes } from './ports/random-codes.js';
import type { SecretBox } from './ports/secret-box.js';
import type { StaffAccountRepository } from './ports/staff-account-repository.js';
import type { StaffChallengeRepository } from './ports/staff-challenge-repository.js';
import type { StaffInviteRepository } from './ports/staff-invite-repository.js';
import type { StaffRecoveryCodeRepository } from './ports/staff-recovery-code-repository.js';
import type { StaffSessionRepository } from './ports/staff-session-repository.js';
import type { StaffTokenIssuer } from './ports/staff-token-issuer.js';
import type { Totp } from './ports/totp.js';

/**
 * Everything the staff use cases can draw on. Each use case takes only the slice it needs
 * (`Pick<StaffDeps, …>`), so its test shows exactly what it touches; the composition root builds
 * the whole set once.
 */
export interface StaffDeps {
  readonly accounts: StaffAccountRepository;
  readonly invites: StaffInviteRepository;
  readonly sessions: StaffSessionRepository;
  readonly challenges: StaffChallengeRepository;
  readonly recoveryCodes: StaffRecoveryCodeRepository;
  readonly passwordHasher: PasswordHasher;
  readonly secretBox: SecretBox;
  readonly totp: Totp;
  readonly codeSender: CodeSender;
  readonly randomCodes: RandomCodes;
  readonly tokenIssuer: StaffTokenIssuer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** 10 single-use recovery codes, issued at enrolment. */
export const RECOVERY_CODE_COUNT = 10;
