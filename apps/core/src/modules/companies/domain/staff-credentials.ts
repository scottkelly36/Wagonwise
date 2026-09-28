import type { StaffId } from './staff-account.js';

/**
 * How the second factor is set up for one account. The TOTP secret is only ever held encrypted
 * (`secretCiphertext`); core decrypts it at the moment it checks a code (P2-M1.4).
 */
export type SecondFactor =
  | { readonly method: 'totp'; readonly secretCiphertext: string }
  | { readonly method: 'sms'; readonly phone: string }
  | { readonly method: 'email' };

/**
 * What a staff member signs in with, kept apart from `StaffAccount` so a password hash or secret
 * can never end up in a DTO by accident: only the sign-in use cases ever load this.
 */
export interface StaffCredentials {
  readonly staffId: StaffId;
  readonly passwordHash: string;
  readonly secondFactor: SecondFactor;
}
