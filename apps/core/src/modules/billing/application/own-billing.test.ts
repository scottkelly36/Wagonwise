import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { Invoice } from '../domain/invoice.js';
import { ownInvoices, ownPlan, type OwnBillingDeps } from './own-billing.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryInvoiceRepository } from './testing/in-memory-invoice-repository.js';
import { InMemoryPlanRepository } from './testing/in-memory-plan-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');

const billingManager: StaffCaller = {
  kind: 'fleet',
  companyId: acme,
  privileges: ['manage_billing'],
};
const dispatcher: StaffCaller = {
  kind: 'fleet',
  companyId: acme,
  privileges: ['dispatch', 'manage_users'],
};
const admin: StaffCaller = { kind: 'platform' };

function invoice(
  companyId: typeof acme,
  month: string,
  status: Invoice['status'],
  id: string,
): Invoice {
  return {
    id: makeId<'InvoiceId'>(id),
    companyId,
    companyName: 'Co',
    month,
    status,
    number: status === 'draft' ? undefined : `INV-${id}`,
    lines: [],
    createdAt: new Date('2026-11-02T09:00:00.000Z'),
    issuedAt: undefined,
    paidAt: undefined,
    voidedAt: undefined,
    issuedDetails: undefined,
  };
}

async function setup() {
  const plans = new InMemoryPlanRepository();
  const invoices = new InMemoryInvoiceRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: OwnBillingDeps = {
    plans,
    invoices,
    clock,
    vehicles: { countFor: (c) => Promise.resolve(c === acme ? 4 : 1) },
  };
  await plans.setCapacity({ companyId: acme, effectiveFrom: '2026-09-01', capacity: 5 }, staffId);
  await plans.setCapacity({ companyId: acme, effectiveFrom: '2026-11-01', capacity: 8 }, staffId);
  await plans.setPrice(acme, 1200, staffId);
  await plans.setCapacity({ companyId: beta, effectiveFrom: '2026-09-01', capacity: 99 }, staffId);
  return { deps, invoices };
}

describe('ownPlan', () => {
  it('shows the company its own capacity, how many it uses, the price and the next change', async () => {
    const { deps } = await setup();
    const result = await ownPlan(deps, billingManager);
    expect(result).toEqual({
      ok: true,
      value: {
        capacityToday: 5,
        vehiclesInUse: 4,
        pricePerVehiclePence: 1200,
        monthlyPence: 6000,
        next: { effectiveFrom: '2026-11-01', capacity: 8 },
      },
    });
  });

  it('is for billing managers of a company only: not other staff, and not WagonWise admins here', async () => {
    const { deps } = await setup();
    for (const caller of [dispatcher, admin]) {
      expect(await ownPlan(deps, caller)).toEqual({ ok: false, error: { tag: 'Forbidden' } });
      expect(await ownInvoices(deps, caller)).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    }
  });
});

describe('ownInvoices', () => {
  it('lists the company’s issued, paid and cancelled invoices, never a draft or another company’s', async () => {
    const { deps, invoices } = await setup();
    await invoices.insertDraft(invoice(acme, '2026-08', 'paid', 'a1'), staffId);
    await invoices.insertDraft(invoice(acme, '2026-09', 'issued', 'a2'), staffId);
    await invoices.insertDraft(invoice(acme, '2026-10', 'draft', 'a3'), staffId);
    await invoices.insertDraft(invoice(acme, '2026-07', 'void', 'a4'), staffId);
    await invoices.insertDraft(invoice(beta, '2026-09', 'issued', 'b1'), staffId);
    const result = await ownInvoices(deps, billingManager);
    expect(result.ok && result.value.map((i) => i.id)).toEqual(['a2', 'a1', 'a4']);
  });
});
