import { describe, expect, it } from 'vitest';
import {
  refreshTokenRequestSchema,
  requestOtpRequestSchema,
  revokeSessionParamsSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
} from './identity.js';

describe('requestOtpRequestSchema', () => {
  it('accepts an identifier with no invite code', () => {
    expect(requestOtpRequestSchema.safeParse({ identifier: 'a@example.com' }).success).toBe(true);
  });

  it('accepts an identifier with an invite code', () => {
    const result = requestOtpRequestSchema.safeParse({
      identifier: 'a@example.com',
      inviteCode: 'HEXHAM24',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing identifier', () => {
    expect(requestOtpRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('verifyOtpRequestSchema', () => {
  it('requires identifier and code', () => {
    expect(verifyOtpRequestSchema.safeParse({ identifier: 'a@example.com' }).success).toBe(false);
    expect(
      verifyOtpRequestSchema.safeParse({ identifier: 'a@example.com', code: '123456' }).success,
    ).toBe(true);
  });
});

describe('verifyOtpResponseSchema', () => {
  it('parses a real response shape, including the branded driver id', () => {
    const result = verifyOtpResponseSchema.safeParse({
      accessToken: 'a.b.c',
      refreshToken: 'raw-token',
      driver: {
        id: '9897987c-75a2-431e-b26f-75d784045d0f',
        identifier: 'a@example.com',
        createdAt: '2026-09-22T09:24:27.168Z',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO createdAt', () => {
    const result = verifyOtpResponseSchema.safeParse({
      accessToken: 'a.b.c',
      refreshToken: 'raw-token',
      driver: { id: 'x', identifier: 'a@example.com', createdAt: 'not-a-date' },
    });
    expect(result.success).toBe(false);
  });
});

describe('refreshTokenRequestSchema', () => {
  it('requires a refreshToken', () => {
    expect(refreshTokenRequestSchema.safeParse({}).success).toBe(false);
    expect(refreshTokenRequestSchema.safeParse({ refreshToken: 'x' }).success).toBe(true);
  });
});

describe('revokeSessionParamsSchema', () => {
  it('requires a well-formed UUID', () => {
    expect(revokeSessionParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(
      revokeSessionParamsSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });
});
