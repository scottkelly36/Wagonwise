/** Every unguessable value staff sign-in hands out. Cryptographically random in production. */
export interface RandomCodes {
  /** A 6-digit code for text/email second factors. */
  sixDigitCode(): string;
  /** Single-use codes for a lost second-factor device, easy to read and type. */
  recoveryCodes(count: number): string[];
  /** The secret in an invite link. Long enough that guessing one is hopeless. */
  inviteToken(): string;
  /** A staff refresh token: same strength as an invite token. */
  refreshToken(): string;
}
