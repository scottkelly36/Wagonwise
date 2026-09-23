import { decodeJwt } from 'jose';

// Decode-only, no signature check — this app can't verify a token (it has no key), only the
// BFF and core can (decision 1: "core issues, BFF verifies"). This is purely for scheduling a
// pre-emptive refresh; a forged `exp` would just make the app refresh at the wrong time, never
// grant access to anything, since core re-verifies the signature on every real request.
export function accessTokenExpiryMs(accessToken: string): number | undefined {
  try {
    const claims = decodeJwt(accessToken);
    return typeof claims.exp === 'number' ? claims.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
