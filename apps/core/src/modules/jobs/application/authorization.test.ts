import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { canCreateJob } from './authorization.js';
import type { Caller } from './ports/caller-directory.js';

const companyA = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const companyB = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');

describe('canCreateJob', () => {
  it('allows a WagonWise admin to create a job for any company', () => {
    const admin: Caller = { kind: 'platform' };
    expect(canCreateJob(admin, companyA)).toBe(true);
    expect(canCreateJob(admin, companyB)).toBe(true);
  });

  it("allows a company's staff with dispatch to create a job for their own company", () => {
    const caller: Caller = { kind: 'fleet', companyId: companyA, privileges: ['dispatch'] };
    expect(canCreateJob(caller, companyA)).toBe(true);
  });

  it("denies the right company's staff without dispatch", () => {
    const caller: Caller = { kind: 'fleet', companyId: companyA, privileges: [] };
    expect(canCreateJob(caller, companyA)).toBe(false);
  });

  it('denies dispatch in another company', () => {
    const caller: Caller = { kind: 'fleet', companyId: companyB, privileges: ['dispatch'] };
    expect(canCreateJob(caller, companyA)).toBe(false);
  });
});
