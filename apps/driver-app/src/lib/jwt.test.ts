import { base64url } from 'jose';

import { accessTokenExpiryMs } from './jwt';

// jose's own encoder, not Buffer — this test file has no Node dependency, matching the app
// code it exercises (Buffer isn't polyfilled in the RN runtime).
function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => base64url.encode(JSON.stringify(value));
  return `${encode({ alg: 'none' })}.${encode(payload)}.sig`;
}

describe('accessTokenExpiryMs', () => {
  it('reads exp (seconds) and converts it to milliseconds', () => {
    const token = fakeJwt({ sub: 'driver-1', exp: 1_700_000_000 });
    expect(accessTokenExpiryMs(token)).toBe(1_700_000_000_000);
  });

  it('returns undefined when the payload has no exp claim', () => {
    const token = fakeJwt({ sub: 'driver-1' });
    expect(accessTokenExpiryMs(token)).toBeUndefined();
  });

  it('returns undefined for a malformed token rather than throwing', () => {
    expect(accessTokenExpiryMs('not-a-jwt')).toBeUndefined();
  });
});
