import { describe, expect, it } from 'vitest';
import {
  deviceSchema,
  driverIdParamsSchema,
  inviteCodeSchema,
  listDriversResponseSchema,
  listInviteCodesResponseSchema,
  refreshTokenRequestSchema,
  registerDeviceRequestSchema,
  requestOtpRequestSchema,
  revokeSessionParamsSchema,
  updateDriverRequestSchema,
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
        isAdmin: false,
        scopes: [],
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

describe('registerDeviceRequestSchema', () => {
  it('requires a non-empty pushToken — no driverId field', () => {
    expect(registerDeviceRequestSchema.safeParse({}).success).toBe(false);
    expect(registerDeviceRequestSchema.safeParse({ pushToken: '' }).success).toBe(false);
    expect(
      registerDeviceRequestSchema.safeParse({ pushToken: 'ExponentPushToken[abc]' }).success,
    ).toBe(true);
  });

  it('ignores an extraneous driverId field rather than requiring or rejecting it', () => {
    const result = registerDeviceRequestSchema.safeParse({
      driverId: 'driver-1',
      pushToken: 'ExponentPushToken[abc]',
    });
    expect(result.success).toBe(true);
  });
});

describe('driverSchema (via verifyOtpResponseSchema)', () => {
  it('accepts a companyId, and parses fine without one', () => {
    const withCompany = verifyOtpResponseSchema.safeParse({
      accessToken: 'a.b.c',
      refreshToken: 'raw-token',
      driver: {
        id: 'driver-1',
        identifier: 'a@example.com',
        createdAt: '2026-09-22T09:24:27.168Z',
        isAdmin: false,
        scopes: [],
        companyId: 'company-1',
      },
    });
    expect(withCompany.success).toBe(true);

    const withoutCompany = verifyOtpResponseSchema.safeParse({
      accessToken: 'a.b.c',
      refreshToken: 'raw-token',
      driver: {
        id: 'driver-1',
        identifier: 'a@example.com',
        createdAt: '2026-09-22T09:24:27.168Z',
        isAdmin: false,
        scopes: [],
      },
    });
    expect(withoutCompany.success).toBe(true);
  });
});

describe('listDriversResponseSchema', () => {
  it('parses a list of drivers', () => {
    const result = listDriversResponseSchema.safeParse({
      drivers: [
        {
          id: 'driver-1',
          identifier: 'a@example.com',
          createdAt: '2026-09-22T09:24:27.168Z',
          isAdmin: false,
          scopes: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('updateDriverRequestSchema', () => {
  it('accepts an empty body: companyId is optional', () => {
    expect(updateDriverRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a companyId, or null to clear an assignment', () => {
    expect(updateDriverRequestSchema.safeParse({ companyId: 'company-1' }).success).toBe(true);
    expect(updateDriverRequestSchema.safeParse({ companyId: null }).success).toBe(true);
  });

  it('drops the retired isAdmin and scopes fields, so they can never reach core', () => {
    const parsed = updateDriverRequestSchema.parse({ isAdmin: true, scopes: ['manage_fleet'] });
    expect(parsed).toEqual({});
  });
});

describe('driverIdParamsSchema', () => {
  it('requires a well-formed UUID', () => {
    expect(driverIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(
      driverIdParamsSchema.safeParse({ id: '11111111-1111-4111-8111-111111111111' }).success,
    ).toBe(true);
  });
});

describe('inviteCodeSchema', () => {
  it('parses an unredeemed code', () => {
    const result = inviteCodeSchema.safeParse({
      code: 'HEXHAM24',
      redeemedBy: null,
      redeemedAt: null,
      createdAt: '2026-09-27T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('parses a redeemed code', () => {
    const result = inviteCodeSchema.safeParse({
      code: 'HEXHAM24',
      redeemedBy: 'driver-1',
      redeemedAt: '2026-09-27T09:00:00.000Z',
      createdAt: '2026-09-27T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('listInviteCodesResponseSchema', () => {
  it('parses a list of invite codes', () => {
    const result = listInviteCodesResponseSchema.safeParse({
      inviteCodes: [
        {
          code: 'HEXHAM24',
          redeemedBy: null,
          redeemedAt: null,
          createdAt: '2026-09-27T08:00:00.000Z',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('deviceSchema', () => {
  it('parses a real response shape', () => {
    const result = deviceSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      driverId: 'driver-1',
      pushToken: 'ExponentPushToken[abc]',
      createdAt: '2026-06-15T08:00:00.000Z',
      updatedAt: '2026-06-15T08:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
