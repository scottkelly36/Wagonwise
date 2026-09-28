import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  actorFor,
  PRIVILEGES,
  type FleetUser,
  type PlatformStaff,
  type Privilege,
} from './staff-account.js';
import {
  can,
  canViewStaff,
  checkFleetInvite,
  checkPlatformInvite,
  checkRemoveStaff,
  setPrivileges,
  validatePrivileges,
} from './staff-policy.js';

const companyA = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const companyB = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const createdAt = new Date('2026-09-28T12:00:00Z');

let nextId = 0;
function fleetUser(companyId: typeof companyA, privileges: readonly Privilege[]): FleetUser {
  nextId += 1;
  return {
    kind: 'fleet',
    id: makeId<'StaffId'>(`fleet-${nextId}`),
    email: `user${nextId}@example.com`,
    name: `User ${nextId}`,
    secondFactorMethod: 'totp',
    createdAt,
    companyId,
    privileges,
  };
}

const admin: PlatformStaff = {
  kind: 'platform',
  id: makeId<'StaffId'>('admin-1'),
  email: 'support@wagon-wise.co.uk',
  name: 'Support',
  secondFactorMethod: 'sms',
  createdAt,
};

const owner = fleetUser(companyA, PRIVILEGES);
const dispatcher = fleetUser(companyA, [
  'manage_fleet',
  'dispatch',
  'view_live_map',
  'view_reports',
]);
const viewer = fleetUser(companyA, ['view_live_map', 'view_reports']);
// A manager who was deliberately not given billing.
const managerNoBilling = fleetUser(companyA, [
  'manage_users',
  'manage_fleet',
  'dispatch',
  'view_live_map',
  'view_reports',
]);
const otherCompanyOwner = fleetUser(companyB, PRIVILEGES);

describe('can', () => {
  it('lets WagonWise admins do anything in any company', () => {
    for (const privilege of PRIVILEGES) {
      expect(can(actorFor(admin), privilege, companyA)).toBe(true);
      expect(can(actorFor(admin), privilege, companyB)).toBe(true);
    }
  });

  it('lets a fleet user use exactly the privileges they hold, in their own company', () => {
    for (const privilege of PRIVILEGES) {
      expect(can(actorFor(viewer), privilege, companyA)).toBe(
        viewer.privileges.includes(privilege),
      );
    }
  });

  it('never lets a fleet user act in another company, whatever they hold', () => {
    for (const privilege of PRIVILEGES) {
      expect(can(actorFor(owner), privilege, companyB)).toBe(false);
    }
  });
});

describe('validatePrivileges', () => {
  it('accepts known privileges, including an empty list', () => {
    expect(validatePrivileges(['dispatch', 'view_reports'])).toEqual({
      ok: true,
      value: ['dispatch', 'view_reports'],
    });
    expect(validatePrivileges([])).toEqual({ ok: true, value: [] });
  });

  it('rejects unknown and duplicate values', () => {
    expect(validatePrivileges(['dispatch', 'make_tea'])).toEqual({
      ok: false,
      error: { tag: 'InvalidPrivileges', reason: 'unknown', values: ['make_tea'] },
    });
    expect(validatePrivileges(['dispatch', 'dispatch'])).toEqual({
      ok: false,
      error: { tag: 'InvalidPrivileges', reason: 'duplicate', values: ['dispatch'] },
    });
  });
});

describe('checkFleetInvite', () => {
  it('lets a manager invite into their own company with privileges they hold', () => {
    expect(checkFleetInvite(actorFor(owner), companyA, ['dispatch']).ok).toBe(true);
  });

  it('refuses a manager inviting into another company', () => {
    expect(checkFleetInvite(actorFor(owner), companyB, ['dispatch'])).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('refuses someone without manage_users', () => {
    expect(checkFleetInvite(actorFor(dispatcher), companyA, [])).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it("refuses handing out a privilege the manager doesn't hold", () => {
    expect(
      checkFleetInvite(actorFor(managerNoBilling), companyA, ['dispatch', 'manage_billing']),
    ).toEqual({
      ok: false,
      error: { tag: 'PrivilegeNotHeld', privileges: ['manage_billing'] },
    });
  });

  it('lets a WagonWise admin invite into any company with any privileges', () => {
    expect(checkFleetInvite(actorFor(admin), companyB, PRIVILEGES).ok).toBe(true);
  });
});

describe('checkPlatformInvite', () => {
  it('only WagonWise admins can create WagonWise admins', () => {
    expect(checkPlatformInvite(actorFor(admin)).ok).toBe(true);
    expect(checkPlatformInvite(actorFor(owner))).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('setPrivileges', () => {
  it('lets a manager change a colleague within what they hold', () => {
    const result = setPrivileges(actorFor(owner), viewer, ['view_live_map', 'dispatch'], 1);
    expect(result).toEqual({
      ok: true,
      value: { ...viewer, privileges: ['view_live_map', 'dispatch'] },
    });
  });

  it("refuses switching on a privilege the manager doesn't hold", () => {
    expect(
      setPrivileges(
        actorFor(managerNoBilling),
        viewer,
        [...viewer.privileges, 'manage_billing'],
        2,
      ),
    ).toEqual({
      ok: false,
      error: { tag: 'PrivilegeNotHeld', privileges: ['manage_billing'] },
    });
  });

  it("refuses switching off a privilege the manager doesn't hold", () => {
    // Taking the owner down to just manage_users would switch off billing, which this manager
    // doesn't hold (along with the other privileges being removed that they do hold).
    expect(setPrivileges(actorFor(managerNoBilling), owner, ['manage_users'], 2)).toEqual({
      ok: false,
      error: { tag: 'PrivilegeNotHeld', privileges: ['manage_billing'] },
    });
  });

  it('refuses a manager changing someone in another company, or someone without manage_users', () => {
    expect(setPrivileges(actorFor(owner), otherCompanyOwner, [], 2)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(setPrivileges(actorFor(dispatcher), viewer, [], 1)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('never leaves a company without a manager', () => {
    expect(setPrivileges(actorFor(owner), owner, ['view_reports'], 1)).toEqual({
      ok: false,
      error: { tag: 'LastManager' },
    });
    expect(setPrivileges(actorFor(admin), owner, [], 1)).toEqual({
      ok: false,
      error: { tag: 'LastManager' },
    });
  });

  it('lets a manager step down when another manager remains', () => {
    expect(setPrivileges(actorFor(owner), owner, ['view_reports'], 2).ok).toBe(true);
  });

  it('lets a WagonWise admin change anyone in any company', () => {
    expect(setPrivileges(actorFor(admin), otherCompanyOwner, ['manage_users'], 1).ok).toBe(true);
  });

  it('refuses setting privileges on a WagonWise admin account', () => {
    expect(setPrivileges(actorFor(admin), admin, ['dispatch'], 0)).toEqual({
      ok: false,
      error: { tag: 'NotAFleetUser' },
    });
  });
});

describe('checkRemoveStaff', () => {
  it('lets a manager remove a colleague whose privileges they hold', () => {
    expect(checkRemoveStaff(actorFor(owner), viewer, 1).ok).toBe(true);
  });

  it('refuses removing someone with a privilege the manager lacks', () => {
    expect(checkRemoveStaff(actorFor(managerNoBilling), owner, 2)).toEqual({
      ok: false,
      error: { tag: 'PrivilegeNotHeld', privileges: ['manage_billing'] },
    });
  });

  it('refuses removing the last manager, even for a WagonWise admin', () => {
    expect(checkRemoveStaff(actorFor(admin), owner, 1)).toEqual({
      ok: false,
      error: { tag: 'LastManager' },
    });
    expect(checkRemoveStaff(actorFor(admin), owner, 2).ok).toBe(true);
  });

  it('refuses fleet users removing anyone outside their company or WagonWise admins', () => {
    expect(checkRemoveStaff(actorFor(owner), otherCompanyOwner, 2)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(checkRemoveStaff(actorFor(owner), admin, 0)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(checkRemoveStaff(actorFor(admin), admin, 0).ok).toBe(true);
  });
});

describe('canViewStaff', () => {
  it('managers see their own company; admins see every company; others see none', () => {
    expect(canViewStaff(actorFor(owner), companyA)).toBe(true);
    expect(canViewStaff(actorFor(owner), companyB)).toBe(false);
    expect(canViewStaff(actorFor(viewer), companyA)).toBe(false);
    expect(canViewStaff(actorFor(admin), companyB)).toBe(true);
  });
});
