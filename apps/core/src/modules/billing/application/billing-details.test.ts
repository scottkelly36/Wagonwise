import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { BillingDetails } from '../domain/billing-details.js';
import { getBillingDetails, updateBillingDetails } from './billing-details.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryBillingDetailsRepository } from './testing/in-memory-billing-details-repository.js';

const admin: StaffCaller = { kind: 'platform' };
const fleetManager: StaffCaller = {
  kind: 'fleet',
  companyId: '11111111-1111-4111-8111-111111111111',
  privileges: ['manage_users', 'dispatch', 'view_reports'],
};
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const now = new Date('2026-10-09T09:00:00.000Z');
const clock = { now: () => now };

const real: BillingDetails = {
  tradingName: 'WagonWise Ltd',
  address: '1 High Street, Hexham',
  contactEmail: 'billing@example.com',
  paymentDetails: 'Sort code 00-00-00, account 00000000',
  vatStatus: 'Not VAT registered',
  paymentTerms: '14 days',
};

function setup() {
  const repo = new InMemoryBillingDetailsRepository();
  return { repo, deps: { repo, clock } };
}

describe('billing details', () => {
  it('starts as placeholders, and says which fields still are', async () => {
    const { deps } = setup();
    const result = await getBillingDetails(deps, admin);
    expect(result.ok && result.value.placeholders).toHaveLength(6);
  });

  it('lets a WagonWise admin save real details, after which no placeholders remain', async () => {
    const { deps, repo } = setup();
    const result = await updateBillingDetails(deps, admin, staffId, real);
    expect(result.ok && result.value.placeholders).toEqual([]);
    expect(result.ok && result.value.updatedAt).toEqual(now);
    expect((await repo.get()).details).toEqual(real);
    expect(repo.lastUpdatedBy).toBe(staffId);
  });

  it('keeps the placeholders still left when only some fields are filled in', async () => {
    const { deps } = setup();
    const result = await updateBillingDetails(deps, admin, staffId, {
      ...real,
      paymentDetails: '[Bank details]',
    });
    expect(result.ok && result.value.placeholders).toEqual(['paymentDetails']);
  });

  it('refuses a company manager, for reading and for writing', async () => {
    const { deps, repo } = setup();
    expect(await getBillingDetails(deps, fleetManager)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await updateBillingDetails(deps, fleetManager, staffId, real)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await repo.get()).details.tradingName).toBe('[Trading name]');
  });

  it('refuses an empty field and saves nothing', async () => {
    const { deps, repo } = setup();
    const result = await updateBillingDetails(deps, admin, staffId, { ...real, address: ' ' });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidBillingDetails', fields: ['address'] },
    });
    expect((await repo.get()).details.address).toBe('[Address]');
  });
});
