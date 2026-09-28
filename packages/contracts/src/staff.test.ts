import { describe, expect, it } from 'vitest';
import {
  acceptStaffInviteRequestSchema,
  confirmStaffEnrolmentRequestSchema,
  createStaffInviteRequestSchema,
  PRIVILEGE_PRESETS,
  PRIVILEGES,
  setStaffPrivilegesRequestSchema,
  staffAccountSchema,
  staffSignInRequestSchema,
} from './staff.js';

const fleetUser = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'fleet',
  email: 'office@silcocks.example',
  name: 'Office Manager',
  companyId: '22222222-2222-4222-8222-222222222222',
  privileges: ['manage_users', 'dispatch'],
  secondFactorMethod: 'totp',
  createdAt: '2026-09-28T12:00:00.000Z',
};

const platformUser = {
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'platform',
  email: 'support@wagon-wise.co.uk',
  name: 'WagonWise Support',
  privileges: [],
  secondFactorMethod: 'sms',
  createdAt: '2026-09-28T12:00:00.000Z',
};

describe('privileges and presets', () => {
  it('has exactly the six agreed privileges', () => {
    expect(PRIVILEGES).toEqual([
      'manage_users',
      'manage_fleet',
      'dispatch',
      'view_live_map',
      'view_reports',
      'manage_billing',
    ]);
  });

  it('owner is every privilege; dispatcher and viewer are subsets without manage_users', () => {
    expect([...PRIVILEGE_PRESETS.owner]).toEqual([...PRIVILEGES]);
    for (const preset of [PRIVILEGE_PRESETS.dispatcher, PRIVILEGE_PRESETS.viewer]) {
      expect(preset.every((p) => (PRIVILEGES as readonly string[]).includes(p))).toBe(true);
      expect(preset).not.toContain('manage_users');
    }
    expect(PRIVILEGE_PRESETS.viewer).toEqual(['view_live_map', 'view_reports']);
  });
});

describe('staffAccountSchema', () => {
  it('parses a fleet user and a platform user', () => {
    expect(staffAccountSchema.safeParse(fleetUser).success).toBe(true);
    expect(staffAccountSchema.safeParse(platformUser).success).toBe(true);
  });

  it('requires a company for fleet users and forbids one for platform staff', () => {
    const { companyId: _omit, ...fleetWithoutCompany } = fleetUser;
    expect(staffAccountSchema.safeParse(fleetWithoutCompany).success).toBe(false);
    expect(
      staffAccountSchema.safeParse({ ...platformUser, companyId: fleetUser.companyId }).success,
    ).toBe(false);
  });

  it('gives platform staff no per-company privileges', () => {
    expect(
      staffAccountSchema.safeParse({ ...platformUser, privileges: ['dispatch'] }).success,
    ).toBe(false);
  });

  it('rejects unknown and duplicate privileges', () => {
    expect(staffAccountSchema.safeParse({ ...fleetUser, privileges: ['make_tea'] }).success).toBe(
      false,
    );
    expect(
      staffAccountSchema.safeParse({ ...fleetUser, privileges: ['dispatch', 'dispatch'] }).success,
    ).toBe(false);
  });
});

describe('staffSignInRequestSchema', () => {
  it('needs an email and a password', () => {
    expect(staffSignInRequestSchema.safeParse({ email: 'a@b.co.uk', password: 'x' }).success).toBe(
      true,
    );
    expect(
      staffSignInRequestSchema.safeParse({ email: 'not-an-email', password: 'x' }).success,
    ).toBe(false);
    expect(
      staffSignInRequestSchema.safeParse({ email: 'a@b.co.uk', password: 'x'.repeat(201) }).success,
    ).toBe(false);
  });
});

describe('createStaffInviteRequestSchema', () => {
  it('accepts a fleet invite with a company and a preset', () => {
    expect(
      createStaffInviteRequestSchema.safeParse({
        kind: 'fleet',
        email: 'new@silcocks.example',
        name: 'New Dispatcher',
        companyId: fleetUser.companyId,
        privileges: [...PRIVILEGE_PRESETS.dispatcher],
      }).success,
    ).toBe(true);
  });

  it('refuses a fleet invite without a company, and a platform invite with privileges', () => {
    expect(
      createStaffInviteRequestSchema.safeParse({
        kind: 'fleet',
        email: 'new@silcocks.example',
        name: 'New',
        privileges: [],
      }).success,
    ).toBe(false);
    expect(
      createStaffInviteRequestSchema.safeParse({
        kind: 'platform',
        email: 'new@wagon-wise.co.uk',
        name: 'New',
        privileges: ['dispatch'],
      }).success,
    ).toBe(false);
  });
});

describe('acceptStaffInviteRequestSchema', () => {
  const base = { inviteToken: 'token', password: 'correct horse battery' };

  it('needs a password of at least 12 characters', () => {
    expect(
      acceptStaffInviteRequestSchema.safeParse({
        ...base,
        password: 'short',
        secondFactorMethod: 'totp',
      }).success,
    ).toBe(false);
  });

  it('needs a UK mobile for text-message codes, and only for those', () => {
    expect(
      acceptStaffInviteRequestSchema.safeParse({
        ...base,
        secondFactorMethod: 'sms',
        phone: '+447700900123',
      }).success,
    ).toBe(true);
    expect(
      acceptStaffInviteRequestSchema.safeParse({ ...base, secondFactorMethod: 'sms' }).success,
    ).toBe(false);
    expect(
      acceptStaffInviteRequestSchema.safeParse({
        ...base,
        secondFactorMethod: 'totp',
        phone: '+447700900123',
      }).success,
    ).toBe(false);
    expect(
      acceptStaffInviteRequestSchema.safeParse({
        ...base,
        secondFactorMethod: 'sms',
        phone: '07700900123',
      }).success,
    ).toBe(false);
  });

  it('accepts authenticator and email methods without a phone', () => {
    for (const secondFactorMethod of ['totp', 'email']) {
      expect(
        acceptStaffInviteRequestSchema.safeParse({ ...base, secondFactorMethod }).success,
      ).toBe(true);
    }
  });
});

describe('confirmStaffEnrolmentRequestSchema', () => {
  it('takes a 6-digit code', () => {
    const enrolmentId = '44444444-4444-4444-8444-444444444444';
    expect(
      confirmStaffEnrolmentRequestSchema.safeParse({ enrolmentId, code: '123456' }).success,
    ).toBe(true);
    expect(
      confirmStaffEnrolmentRequestSchema.safeParse({ enrolmentId, code: '12345' }).success,
    ).toBe(false);
    expect(
      confirmStaffEnrolmentRequestSchema.safeParse({ enrolmentId, code: 'abcdef' }).success,
    ).toBe(false);
  });
});

describe('setStaffPrivilegesRequestSchema', () => {
  it('accepts an empty list (all switches off) and rejects duplicates', () => {
    expect(setStaffPrivilegesRequestSchema.safeParse({ privileges: [] }).success).toBe(true);
    expect(
      setStaffPrivilegesRequestSchema.safeParse({ privileges: ['view_reports', 'view_reports'] })
        .success,
    ).toBe(false);
  });
});
