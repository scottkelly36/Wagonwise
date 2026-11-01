import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { DriverId } from './driver.js';
import { identifierForms, type InvalidIdentifier } from './identifier.js';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/** Wrong passwords in a row before the account is locked, and for how long. */
export const MAX_FAILED_PASSWORDS = 5;
export const PASSWORD_LOCKOUT_MS = 15 * 60 * 1000;

export type PasswordTooShort = TaggedError<'PasswordTooShort'>;
export type PasswordTooLong = TaggedError<'PasswordTooLong'>;
export type PasswordIsEmail = TaggedError<'PasswordIsEmail'>;
/** A password account is made with an email, because its second factor is a code sent there. */
export type EmailRequired = TaggedError<'EmailRequired'>;

/**
 * Length is what counts, so there are no rules about symbols or capitals. Counted in characters
 * (not UTF-16 units), so an emoji is one. The upper limit keeps the hashing from being used to
 * tie the server up.
 */
export function validatePassword(
  password: string,
  email: string,
): Result<void, PasswordTooShort | PasswordTooLong | PasswordIsEmail> {
  const length = [...password].length;
  if (length < MIN_PASSWORD_LENGTH) return err({ tag: 'PasswordTooShort' });
  if (length > MAX_PASSWORD_LENGTH) return err({ tag: 'PasswordTooLong' });
  if (password.trim().toLowerCase() === email) return err({ tag: 'PasswordIsEmail' });
  return ok(undefined);
}

/** A typed email, tidied (trimmed, lower case). A phone number or garbage is refused. */
export function emailIdentifier(raw: string): Result<string, InvalidIdentifier | EmailRequired> {
  const forms = identifierForms(raw);
  if (!forms.ok) return forms;
  const [first] = forms.value;
  return first.includes('@') ? ok(first) : err({ tag: 'EmailRequired' });
}

/** What a driver who has a password has beside their account. */
export interface DriverCredential {
  readonly driverId: DriverId;
  readonly passwordHash: string;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
  readonly updatedAt: Date;
}

export function newCredential(
  driverId: DriverId,
  passwordHash: string,
  now: Date,
): DriverCredential {
  return { driverId, passwordHash, failedAttempts: 0, lockedUntil: null, updatedAt: now };
}

export function isLockedOut(credential: DriverCredential, now: Date): boolean {
  return credential.lockedUntil !== null && credential.lockedUntil.getTime() > now.getTime();
}

/** A wrong guess counts; the fifth in a row locks the account for a while and starts the count again. */
export function afterWrongPassword(credential: DriverCredential, now: Date): DriverCredential {
  const failedAttempts = credential.failedAttempts + 1;
  if (failedAttempts >= MAX_FAILED_PASSWORDS) {
    return {
      ...credential,
      failedAttempts: 0,
      lockedUntil: new Date(now.getTime() + PASSWORD_LOCKOUT_MS),
      updatedAt: now,
    };
  }
  return { ...credential, failedAttempts, updatedAt: now };
}

export function afterRightPassword(credential: DriverCredential, now: Date): DriverCredential {
  return { ...credential, failedAttempts: 0, lockedUntil: null, updatedAt: now };
}
