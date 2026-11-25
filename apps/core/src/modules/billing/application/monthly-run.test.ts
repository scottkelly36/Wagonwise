import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { BillingDetails } from '../domain/billing-details.js';
import { monthlyRunEmail } from '../domain/monthly-run-email.js';
import type { VehicleUse } from '../domain/invoice.js';
import { runMonthlyDrafts, type MonthlyRunDeps } from './monthly-run.js';
import { InMemoryBillingDetailsRepository } from './testing/in-memory-billing-details-repository.js';
import { InMemoryDraftRunRepository } from './testing/in-memory-draft-run-repository.js';
import { InMemoryInvoiceRepository } from './testing/in-memory-invoice-repository.js';
import { InMemoryPlanRepository } from './testing/in-memory-plan-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const trialFirm = makeId<'CompanyId'>('33333333-3333-4333-8333-333333333333');

const busy = (count: number, prefix: string): VehicleUse[] =>
  Array.from({ length: count }, (_, i) => ({
    vehicleId: `${prefix}-${i}`,
    firstDay: '2026-01-01',
    usedInMonth: true,
  }));

const real: BillingDetails = {
  tradingName: 'WagonWise Ltd',
  address: '1 High Street, Hexham',
  contactEmail: 'billing@example.com',
  paymentDetails: 'Sort code 00-00-00, account 00000000',
  vatStatus: 'Not VAT registered',
  paymentTerms: '14 days',
};

function setup(at: string) {
  const invoices = new InMemoryInvoiceRepository();
  const runs = new InMemoryDraftRunRepository();
  const details = new InMemoryBillingDetailsRepository();
  const clock = new FakeClock(at);
  const deps: MonthlyRunDeps = {
    invoices,
    details,
    plans: new InMemoryPlanRepository(),
    clock,
    ids: new SequentialIdGenerator(),
    runs,
    // acme and beta have worked; the third firm is on a trial that ends on 20 October 2026.
    companies: {
      list: () =>
        Promise.resolve([
          { id: acme, name: 'Acme Freight' },
          { id: beta, name: 'Beta Haulage', trialEndsOn: '2026-08-15' },
          { id: trialFirm, name: 'Newly Trialling Ltd', trialEndsOn: '2026-10-20' },
        ]),
    },
    vehicleUse: {
      usedBetween: (companyId) =>
        Promise.resolve(
          companyId === acme ? busy(3, 'a') : companyId === beta ? busy(1, 'b') : busy(2, 't'),
        ),
    },
  };
  return { deps, invoices, runs, details, clock };
}

describe('runMonthlyDrafts', () => {
  it('does nothing on the 1st of the month', async () => {
    const { deps, invoices } = setup('2026-11-01T09:00:00.000Z');
    expect(await runMonthlyDrafts(deps)).toEqual({ ran: false, reason: 'too_early' });
    expect(await invoices.list()).toHaveLength(0);
  });

  it('drafts last month from the 2nd, for firms with use, leaving a firm whose trial covers it alone', async () => {
    const { deps, invoices, runs } = setup('2026-11-02T09:00:00.000Z');
    const outcome = await runMonthlyDrafts(deps);
    expect(outcome).toMatchObject({
      ran: true,
      month: '2026-10',
      totalPence: 4000,
      onTrial: 1,
      detailsIncomplete: true,
    });
    expect(outcome.ran && outcome.drafts).toEqual([
      { company: 'Acme Freight', totalPence: 3000 },
      { company: 'Beta Haulage', totalPence: 1000 },
    ]);
    const all = await invoices.list();
    expect(all.map((i) => [i.companyName, i.status, i.month])).toEqual([
      ['Acme Freight', 'draft', '2026-10'],
      ['Beta Haulage', 'draft', '2026-10'],
    ]);
    expect(runs.runs.get('2026-10')).toMatchObject({ drafts: 2, totalPence: 4000 });
  });

  it('bills a trial firm from the first full month after its trial: covered in October, billed in November', async () => {
    const { deps, invoices, clock } = setup('2026-11-02T09:00:00.000Z');
    await runMonthlyDrafts(deps);
    expect((await invoices.list()).some((i) => i.companyName === 'Newly Trialling Ltd')).toBe(
      false,
    );
    clock.set('2026-12-02T09:00:00.000Z');
    await runMonthlyDrafts(deps);
    const november = (await invoices.list()).filter((i) => i.month === '2026-11');
    expect(november.map((i) => i.companyName)).toEqual([
      'Acme Freight',
      'Beta Haulage',
      'Newly Trialling Ltd',
    ]);
  });

  it('does it once a month: a second run does nothing, and a draft deleted on purpose stays deleted', async () => {
    const { deps, invoices } = setup('2026-11-02T09:00:00.000Z');
    await runMonthlyDrafts(deps);
    const first = (await invoices.list())[0];
    if (first === undefined) throw new Error('no draft');
    await invoices.deleteDraft(first.id);
    expect(await runMonthlyDrafts(deps)).toEqual({ ran: false, reason: 'already_done' });
    expect(await invoices.list()).toHaveLength(1);
  });

  it('does a missed month when it first runs, whichever day after the 2nd that is', async () => {
    const { deps, invoices } = setup('2026-11-19T09:00:00.000Z');
    expect((await runMonthlyDrafts(deps)).ran).toBe(true);
    expect((await invoices.list()).every((i) => i.month === '2026-10')).toBe(true);
  });

  it('drafts December in January, across the year end', async () => {
    const { deps, invoices } = setup('2027-01-02T09:00:00.000Z');
    const outcome = await runMonthlyDrafts(deps);
    expect(outcome.ran && outcome.month).toBe('2026-12');
    expect((await invoices.list()).every((i) => i.month === '2026-12')).toBe(true);
  });

  it('says whether the owner can issue yet: not while the billing details hold brackets', async () => {
    const { deps, details } = setup('2026-11-02T09:00:00.000Z');
    await details.save(real, makeId<'StaffId'>('50000000-0000-4000-8000-000000000001'), new Date());
    const outcome = await runMonthlyDrafts(deps);
    expect(outcome.ran && outcome.detailsIncomplete).toBe(false);
  });

  it('notes a month with nothing to bill, so it is not tried again', async () => {
    const { deps, runs } = setup('2026-11-02T09:00:00.000Z');
    const quiet: MonthlyRunDeps = {
      ...deps,
      vehicleUse: { usedBetween: () => Promise.resolve([]) },
    };
    const outcome = await runMonthlyDrafts(quiet);
    expect(outcome).toMatchObject({ ran: true, totalPence: 0 });
    expect(runs.runs.has('2026-10')).toBe(true);
  });
});

describe('monthlyRunEmail', () => {
  const summary = {
    month: '2026-10',
    drafts: [
      { company: 'Acme Freight', totalPence: 3000 },
      { company: 'Beta Haulage', totalPence: 1050 },
    ],
    totalPence: 4050,
    onTrial: 2,
    detailsIncomplete: false,
  };

  it('lists the drafts and the total, says what to do next, and that nothing has been charged', () => {
    const mail = monthlyRunEmail(summary, 'https://dashboard.example.com/');
    expect(mail.subject).toBe('Invoices for October 2026: 2 drafts, £40.50');
    expect(mail.text).toContain('Acme Freight: £30.00');
    expect(mail.text).toContain('Beta Haulage: £10.50');
    expect(mail.text).toContain('2 firms are still on a free trial and not billed.');
    expect(mail.text).toContain('Issue and collect all');
    expect(mail.text).toContain('https://dashboard.example.com/admin/invoices');
    expect(mail.text).toContain('Nothing has been issued or charged.');
  });

  it('warns first when the billing details still have brackets', () => {
    const mail = monthlyRunEmail({ ...summary, detailsIncomplete: true }, undefined);
    expect(mail.text).toContain('[brackets]');
    expect(mail.text).not.toContain('Issue and collect all');
  });

  it('copes with one draft, and with nothing to bill', () => {
    expect(
      monthlyRunEmail(
        { ...summary, drafts: [summary.drafts[0]!], totalPence: 3000, onTrial: 1 },
        undefined,
      ).subject,
    ).toBe('Invoices for October 2026: 1 draft, £30.00');
    const none = monthlyRunEmail({ ...summary, drafts: [], totalPence: 0, onTrial: 0 }, undefined);
    expect(none.subject).toBe('Invoices for October 2026: nothing to bill');
  });
});
