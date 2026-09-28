import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { canManageFleet, canViewFleet } from './authorization.js';
import type { Caller } from './ports/caller-directory.js';

const companyA = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const companyB = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');

describe('canViewFleet', () => {
  it('allows an admin to view any company', () => {
    const admin: Caller = { isAdmin: true, scopes: [] };
    expect(canViewFleet(admin, companyA)).toBe(true);
    expect(canViewFleet(admin, companyB)).toBe(true);
  });

  it('allows a driver with no scope to view their own company', () => {
    const caller: Caller = { isAdmin: false, companyId: companyA, scopes: [] };
    expect(canViewFleet(caller, companyA)).toBe(true);
  });

  it('denies a driver viewing a different company', () => {
    const caller: Caller = { isAdmin: false, companyId: companyA, scopes: [] };
    expect(canViewFleet(caller, companyB)).toBe(false);
  });

  it('denies a driver with no company at all', () => {
    const caller: Caller = { isAdmin: false, scopes: [] };
    expect(canViewFleet(caller, companyA)).toBe(false);
  });
});

describe('canManageFleet', () => {
  it('allows an admin to manage any company, scope or not', () => {
    const admin: Caller = { isAdmin: true, scopes: [] };
    expect(canManageFleet(admin, companyA)).toBe(true);
  });

  it('allows a driver in the right company with the manage_fleet scope', () => {
    const caller: Caller = { isAdmin: false, companyId: companyA, scopes: ['manage_fleet'] };
    expect(canManageFleet(caller, companyA)).toBe(true);
  });

  it('denies a driver in the right company without the scope', () => {
    const caller: Caller = { isAdmin: false, companyId: companyA, scopes: [] };
    expect(canManageFleet(caller, companyA)).toBe(false);
  });

  it('denies a driver with the scope but the wrong company', () => {
    const caller: Caller = { isAdmin: false, companyId: companyB, scopes: ['manage_fleet'] };
    expect(canManageFleet(caller, companyA)).toBe(false);
  });
});
