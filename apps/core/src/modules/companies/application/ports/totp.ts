/** Time-based one-time codes for authenticator apps (RFC 6238: 6 digits, 30-second steps). */
export interface Totp {
  /** A fresh shared secret, base32-encoded (what authenticator apps expect). */
  generateSecret(): string;
  /** The otpauth:// link a QR code is made from. `account` is shown in the app, e.g. an email. */
  provisioningUri(secret: string, account: string): string;
  /** Accepts the current code and the ones either side of it, to allow for clock drift. */
  verify(secret: string, code: string, now: Date): boolean;
}
