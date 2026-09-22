import { describe, expect, it } from 'vitest';
import { MAX_OTP_ATTEMPTS, verify, type Otp } from './otp.js';

const now = new Date('2026-06-15T08:00:00.000Z');
const CODE_HASH = 'hash-of-123456';
const WRONG_HASH = 'hash-of-000000';

function freshOtp(overrides: Partial<Otp> = {}): Otp {
  return {
    id: 'otp-1',
    codeHash: CODE_HASH,
    expiresAt: new Date('2026-06-15T08:10:00.000Z'),
    consumedAt: null,
    attempts: 0,
    ...overrides,
  };
}

describe('verify', () => {
  it('succeeds on the right code and marks it consumed', () => {
    const otp = freshOtp();
    const { outcome, next } = verify(otp, CODE_HASH, now);
    expect(outcome).toEqual({ ok: true, value: { ...otp, consumedAt: now } });
    expect(next).toEqual({ ...otp, consumedAt: now });
  });

  it('rejects the wrong code, and bumps attempts on the persisted state', () => {
    const otp = freshOtp();
    const { outcome, next } = verify(otp, WRONG_HASH, now);
    expect(outcome).toEqual({
      ok: false,
      error: { tag: 'OtpIncorrect', attemptsRemaining: MAX_OTP_ATTEMPTS - 1 },
    });
    expect(next).toEqual({ ...otp, attempts: 1 });
  });

  it('rejects an already-consumed code without touching attempts', () => {
    const otp = freshOtp({ consumedAt: new Date('2026-06-15T08:01:00.000Z') });
    const { outcome, next } = verify(otp, CODE_HASH, now);
    expect(outcome).toEqual({ ok: false, error: { tag: 'OtpAlreadyConsumed' } });
    expect(next).toEqual(otp);
  });

  it('rejects an expired code, right code or not', () => {
    const otp = freshOtp({ expiresAt: new Date('2026-06-15T07:59:59.000Z') });
    const { outcome } = verify(otp, CODE_HASH, now);
    expect(outcome).toEqual({ ok: false, error: { tag: 'OtpExpired' } });
  });

  it('treats a code expiring at exactly `now` as expired (boundary is exclusive)', () => {
    const otp = freshOtp({ expiresAt: now });
    const { outcome } = verify(otp, CODE_HASH, now);
    expect(outcome).toEqual({ ok: false, error: { tag: 'OtpExpired' } });
  });

  it(`locks out after ${MAX_OTP_ATTEMPTS} wrong attempts, even with the right code`, () => {
    const otp = freshOtp({ attempts: MAX_OTP_ATTEMPTS });
    const { outcome, next } = verify(otp, CODE_HASH, now);
    expect(outcome).toEqual({ ok: false, error: { tag: 'TooManyAttempts' } });
    expect(next).toEqual(otp); // does not consume it — the lockout is the point
  });

  it('counts down attemptsRemaining correctly on the last allowed guess', () => {
    const otp = freshOtp({ attempts: MAX_OTP_ATTEMPTS - 1 });
    const { outcome } = verify(otp, WRONG_HASH, now);
    expect(outcome).toEqual({
      ok: false,
      error: { tag: 'OtpIncorrect', attemptsRemaining: 0 },
    });
  });

  it('does not mutate the original Otp', () => {
    const otp = freshOtp();
    verify(otp, WRONG_HASH, now);
    expect(otp.attempts).toBe(0);
  });
});
