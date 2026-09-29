import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { canManageFleet, canViewFleet } from './authorization.js';
import type { Caller } from './ports/caller-directory.js';

const companyA = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const companyB = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');

describe('canViewFleet', () => {
  it('allows a WagonWise admin to view any company', () => {
    const admin: Caller = { kind: 'platform' };
    expect(canViewFleet(admin, companyA)).toBe(true);
    expect(canViewFleet(admin, companyB)).toBe(true);
  });

  it("allows a company's staff to view their own company, no privilege needed", () => {
    const caller: Caller = { kind: 'fleet', companyId: companyA, privileges: [] };
    expect(canViewFleet(caller, companyA)).toBe(true);
  });

  it('denies viewing a different company', () => {
    const caller: Caller = { kind: 'fleet', companyId: companyA, privileges: [] };
    expect(canViewFleet(caller, companyB)).toBe(false);
  });
});

describe('canManageFleet', () => {
  it('allows a WagonWise admin to manage any company', () => {
    const admin: Caller = { kind: 'platform' };
    expect(canManageFleet(admin, companyA)).toBe(true);
  });

  it("allows a company's staff with manage_fleet to manage it", () => {
    const caller: Caller = { kind: 'fleet', companyId: companyA, privileges: ['manage_fleet'] };
    expect(canManageFleet(caller, companyA)).toBe(true);
  });

  it("denies the right company's staff without manage_fleet", () => {
    const caller: Caller = { kind: 'fleet', companyId: companyA, privileges: [] };
    expect(canManageFleet(caller, companyA)).toBe(false);
  });

  it('denies manage_fleet in another company', () => {
    const caller: Caller = { kind: 'fleet', companyId: companyB, privileges: ['manage_fleet'] };
    expect(canManageFleet(caller, companyA)).toBe(false);
  });
});
