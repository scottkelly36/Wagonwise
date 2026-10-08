import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Invoice } from '../domain/invoice.js';
import {
  addCost,
  changeCost,
  deleteCost,
  financeReport,
  stopCost,
  type FinanceDeps,
} from './finance.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryCostRepository } from './testing/in-memory-cost-repository.js';
import { InMemoryInvoiceRepository } from './testing/in-memory-invoice-repository.js';
import { InMemoryPlanRepository } from './testing/in-memory-plan-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const admin: StaffCaller = { kind: 'platform' };
const manager: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_billing'] };

async function setup() {
  const costs = new InMemoryCostRepository();
  const invoices = new InMemoryInvoiceRepository();
  const plans = new InMemoryPlanRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: FinanceDeps = {
    costs,
    invoices,
    plans,
    clock,
    ids: new SequentialIdGenerator(),
    companies: { list: () => Promise.resolve([{ id: acme, name: 'Acme Freight' }]) },
  };
  await plans.setCapacity({ companyId: acme, effectiveFrom: '2026-01-01', capacity: 6 }, staffId);
  return { deps, costs, invoices, plans, clock };
}

const hosting = { category: 'hosting', description: 'Servers', amountPence: 5000 };

function invoice(month: string, status: Invoice['status'], pence: number): Invoice {
  return {
    id: makeId<'InvoiceId'>(`i-${month}-${status}`),
    companyId: acme,
    companyName: 'Acme Freight',
    month,
    status,
    number: status === 'draft' ? undefined : `INV-${month}`,
    lines: [
      {
        id: makeId<'InvoiceLineId'>('l'),
        description: 'Plan',
        quantity: 1,
        unitPence: pence,
        amountPence: pence,
      },
    ],
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    issuedAt: undefined,
    paidAt: undefined,
    voidedAt: undefined,
    issuedDetails: undefined,
  };
}

describe('standing costs', () => {
  it('carry on every month from the one they start, so they are entered once', async () => {
    const { deps } = await setup();
    await addCost(deps, admin, staffId, { ...hosting, fromMonth: '2026-08', oneOff: false });
    const report = await financeReport(deps, admin, '2026-10');
    expect(report.ok && report.value.months.map((m) => [m.month, m.costsPence]).slice(-4)).toEqual([
      ['2026-07', 0],
      ['2026-08', 5000],
      ['2026-09', 5000],
      ['2026-10', 5000],
    ]);
  });

  it('can be a one-off that applies to a single month', async () => {
    const { deps } = await setup();
    await addCost(deps, admin, staffId, {
      category: 'other',
      description: 'Logo',
      amountPence: 12000,
      fromMonth: '2026-09',
      oneOff: true,
    });
    const report = await financeReport(deps, admin, '2026-10');
    expect(report.ok && report.value.months.map((m) => m.costsPence).slice(-3)).toEqual([
      0, 12000, 0,
    ]);
  });

  it('keep earlier months as they were when the amount changes from a later month', async () => {
    const { deps } = await setup();
    const added = await addCost(deps, admin, staffId, {
      ...hosting,
      fromMonth: '2026-08',
      oneOff: false,
    });
    if (!added.ok) throw new Error('setup');
    const changed = await changeCost(deps, admin, staffId, added.value.id, {
      ...hosting,
      amountPence: 8000,
      fromMonth: '2026-10',
    });
    expect(changed.ok && changed.value).toMatchObject({ amountPence: 8000, fromMonth: '2026-10' });
    const report = await financeReport(deps, admin, '2026-10');
    expect(report.ok && report.value.months.map((m) => m.costsPence).slice(-3)).toEqual([
      5000, 5000, 8000,
    ]);
  });

  it('are updated in place when changed from the month they started', async () => {
    const { deps, costs } = await setup();
    const added = await addCost(deps, admin, staffId, {
      ...hosting,
      fromMonth: '2026-10',
      oneOff: false,
    });
    if (!added.ok) throw new Error('setup');
    await changeCost(deps, admin, staffId, added.value.id, {
      ...hosting,
      amountPence: 9000,
      fromMonth: '2026-10',
    });
    const all = await costs.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.amountPence).toBe(9000);
  });

  it('end the month before they are stopped, and are removed if stopped from their first month', async () => {
    const { deps, costs } = await setup();
    const a = await addCost(deps, admin, staffId, {
      ...hosting,
      fromMonth: '2026-08',
      oneOff: false,
    });
    const b = await addCost(deps, admin, staffId, {
      ...hosting,
      description: 'Trial',
      fromMonth: '2026-10',
      oneOff: false,
    });
    if (!a.ok || !b.ok) throw new Error('setup');
    expect((await stopCost(deps, admin, a.value.id, '2026-10')).ok).toBe(true);
    expect((await stopCost(deps, admin, b.value.id, '2026-10')).ok).toBe(true);
    const all = await costs.list();
    expect(all.map((c) => [c.description, c.toMonth])).toEqual([['Servers', '2026-09']]);
    const report = await financeReport(deps, admin, '2026-11');
    expect(report.ok && report.value.months.map((m) => m.costsPence).slice(-3)).toEqual([
      5000, 0, 0,
    ]);
  });

  it('refuse a change before they started, or to something that has ended', async () => {
    const { deps } = await setup();
    const added = await addCost(deps, admin, staffId, {
      ...hosting,
      fromMonth: '2026-08',
      oneOff: false,
    });
    if (!added.ok) throw new Error('setup');
    expect(
      await changeCost(deps, admin, staffId, added.value.id, { ...hosting, fromMonth: '2026-06' }),
    ).toEqual({
      ok: false,
      error: { tag: 'InvalidCostChange', reason: 'before_start' },
    });
    await stopCost(deps, admin, added.value.id, '2026-10');
    expect(
      await changeCost(deps, admin, staffId, added.value.id, { ...hosting, fromMonth: '2026-11' }),
    ).toEqual({
      ok: false,
      error: { tag: 'InvalidCostChange', reason: 'after_end' },
    });
  });

  it('can be deleted outright when entered by mistake', async () => {
    const { deps, costs } = await setup();
    const added = await addCost(deps, admin, staffId, {
      ...hosting,
      fromMonth: '2026-08',
      oneOff: false,
    });
    if (!added.ok) throw new Error('setup');
    expect((await deleteCost(deps, admin, added.value.id)).ok).toBe(true);
    expect(await costs.list()).toEqual([]);
    expect(await deleteCost(deps, admin, added.value.id)).toEqual({
      ok: false,
      error: { tag: 'CostNotFound' },
    });
  });

  it('refuse bad entries, and anyone but a WagonWise admin', async () => {
    const { deps } = await setup();
    const base = { ...hosting, fromMonth: '2026-08', oneOff: false };
    expect((await addCost(deps, admin, staffId, { ...base, amountPence: -5 })).ok).toBe(false);
    expect((await addCost(deps, admin, staffId, { ...base, category: 'lunch' })).ok).toBe(false);
    expect((await addCost(deps, admin, staffId, { ...base, fromMonth: 'soon' })).ok).toBe(false);
    expect(await addCost(deps, manager, staffId, base)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await financeReport(deps, manager, undefined)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('financeReport', () => {
  it('shows twelve months, defaulting to this one, with revenue from issued and paid invoices against the costs', async () => {
    const { deps, invoices } = await setup();
    await addCost(deps, admin, staffId, { ...hosting, fromMonth: '2026-01', oneOff: false });
    await invoices.insertDraft(invoice('2026-09', 'paid', 6000), staffId);
    await invoices.insertDraft(invoice('2026-10', 'issued', 6000), staffId);
    await invoices.insertDraft(invoice('2026-08', 'void', 99999), staffId);
    await invoices.insertDraft(invoice('2026-07', 'draft', 88888), staffId);

    const report = await financeReport(deps, admin, undefined);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value.month).toBe('2026-10');
    expect(report.value.months).toHaveLength(12);
    expect(report.value.months[0]?.month).toBe('2025-11');
    const byMonth = Object.fromEntries(report.value.months.map((m) => [m.month, m]));
    expect(byMonth['2026-09']).toMatchObject({
      invoicedPence: 6000,
      receivedPence: 6000,
      costsPence: 5000,
      profitInvoicedPence: 1000,
    });
    expect(byMonth['2026-10']).toMatchObject({
      invoicedPence: 6000,
      receivedPence: 0,
      profitInvoicedPence: 1000,
      profitReceivedPence: -5000,
    });
    // A cancelled or draft invoice is never revenue.
    expect(byMonth['2026-08']?.invoicedPence).toBe(0);
    expect(byMonth['2026-07']?.invoicedPence).toBe(0);
  });

  it('breaks the selected month down by company and lists the costs in force', async () => {
    const { deps, invoices } = await setup();
    await addCost(deps, admin, staffId, { ...hosting, fromMonth: '2026-01', oneOff: false });
    await invoices.insertDraft(invoice('2026-09', 'paid', 6000), staffId);
    const report = await financeReport(deps, admin, '2026-09');
    expect(report.ok && report.value.revenueByCompany).toEqual([
      { companyId: acme, name: 'Acme Freight', invoicedPence: 6000, receivedPence: 6000 },
    ]);
    expect(report.ok && report.value.costs.map((c) => c.description)).toEqual(['Servers']);
  });

  it('looks ahead from today’s plans and the costs standing this month', async () => {
    const { deps } = await setup();
    await addCost(deps, admin, staffId, {
      ...hosting,
      amountPence: 4000,
      fromMonth: '2026-01',
      oneOff: false,
    });
    // 6 vehicles at the default £10 is £60 a month, against £40 of standing costs.
    const report = await financeReport(deps, admin, '2026-06');
    expect(report.ok && report.value.projection).toMatchObject({
      monthlyRevenuePence: 6000,
      monthlyCostsPence: 4000,
      projectedProfitPence: 2000,
      vehiclesCovered: 6,
      breakEvenVehicles: 4,
    });
    expect(report.ok && report.value.currentMonth).toBe('2026-10');
  });

  it('refuses a month that is not one', async () => {
    const { deps } = await setup();
    expect(await financeReport(deps, admin, '2026-13')).toEqual({
      ok: false,
      error: { tag: 'InvalidMonth' },
    });
  });
});
