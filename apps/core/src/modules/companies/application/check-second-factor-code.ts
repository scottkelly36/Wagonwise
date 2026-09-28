import type { SecondFactor } from '../domain/staff-credentials.js';
import type { StaffChallenge } from '../domain/staff-challenge.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

/**
 * Does `code` satisfy `challenge`? For an authenticator app, checks it against the (decrypted)
 * secret; for a texted or emailed code, against the stored hash. Recovery codes are handled by
 * the sign-in use case, not here: they only apply once an account exists.
 */
export function checkSecondFactorCode(
  deps: Pick<StaffDeps, 'secretBox' | 'totp' | 'clock'>,
  challenge: StaffChallenge,
  totpSecretCiphertext: string | null,
  code: string,
): boolean {
  if (challenge.method === 'totp') {
    if (totpSecretCiphertext === null) return false;
    return deps.totp.verify(deps.secretBox.decrypt(totpSecretCiphertext), code, deps.clock.now());
  }
  return challenge.codeHash !== null && challenge.codeHash === sha256Hex(code);
}

export function totpCiphertextOf(factor: SecondFactor): string | null {
  return factor.method === 'totp' ? factor.secretCiphertext : null;
}
