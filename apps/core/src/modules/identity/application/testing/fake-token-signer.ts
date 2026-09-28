import type {
  AccessTokenClaims,
  StaffAccessTokenClaims,
  TokenSigner,
} from '../ports/token-signer.js';

/** No real signing — a readable, deterministic string, so tests can assert on it directly. */
export class FakeTokenSigner implements TokenSigner {
  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return Promise.resolve(`access-token:${claims.driverId}:${claims.sessionId}`);
  }

  signStaffAccessToken(claims: StaffAccessTokenClaims): Promise<string> {
    return Promise.resolve(`staff-access-token:${claims.staffId}:${claims.sessionId}`);
  }

  publicJwk(): Promise<Record<string, unknown>> {
    return Promise.resolve({ kty: 'OKP', crv: 'Ed25519', x: 'fake-key' });
  }
}
