import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { BillingDetails } from '../domain/billing-details.js';
import { totalPence, type Invoice } from '../domain/invoice.js';
import {
  addManualLine,
  deleteDraft,
  generateInvoices,
  getInvoice,
  issueInvoice,
  listInvoices,
  markInvoicePaid,
  removeLine,
  voidInvoice,
  type InvoiceDeps,
} from './invoices.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryBillingDetailsRepository } from './testing/in-memory-billing-details-repository.js';
import { InMemoryInvoiceRepository } from './testing/in-memory-invoice-repository.js';
import { InMemoryPlanRepository } from './testing/in-memory-plan-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const gamma = makeId<'CompanyId'>('33333333-3333-4333-8333-333333333333');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const admin: StaffCaller = { kind: 'platform' };
const manager: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_users'] };

const real: BillingDetails = {
  tradingName: 'WagonWise Ltd',
  address: '1 High Street, Hexham',
  contactEmail: 'billing@example.com',
  paymentDetails: 'Sort code 00-00-00, account 00000000',
  vatStatus: 'Not VAT registered',
  paymentTerms: '14 days',
};

async function setup() {
  const plans = new InMemoryPlanRepository();
  const details = new InMemoryBillingDetailsRepository();
  const invoices = new InMemoryInvoiceRepository();
  const clock = new FakeClock('2026-11-02T09:00:00.000Z');
  const deps: InvoiceDeps = {
    invoices,
    details,
    plans,
    clock,
    ids: new SequentialIdGenerator(),
    companies: {
      list: () =>
        Promise.resolve([
          { id: acme, name: 'Acme Freight' },
          { id: beta, name: 'Beta Haulage' },
          { id: gamma, name: 'Gamma Ltd' },
        ]),
    },
  };
  await plans.setCapacity(
    { companyId: acme, effectiveFrom: '2026-09-01', capacity: 5 },
    staffId,
    clock.now(),
  );
  await plans.setCapacity(
    { companyId: beta, effectiveFrom: '2026-09-01', capacity: 2 },
    staffId,
    clock.now(),
  );
  await plans.setPrice(beta, 1500, staffId, clock.now());
  // gamma has no capacity: nothing to bill.
  return { deps, details, invoices, clock };
}

async function draftFor(deps: InvoiceDeps, company = acme): Promise<Invoice> {
  const generated = await generateInvoices(deps, admin, staffId, '2026-10');
  if (!generated.ok) throw new Error('generate failed');
  const found = generated.value.created.find((i) => i.companyId === company);
  if (!found) throw new Error('no draft');
  return found;
}

describe('generateInvoices', () => {
  it('drafts an invoice for each company with something to bill, at its own price', async () => {
    const { deps } = await setup();
    const result = await generateInvoices(deps, admin, staffId, '2026-10');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created.map((i) => [i.companyName, i.status, totalPence(i.lines)])).toEqual(
      [
        ['Acme Freight', 'draft', 5000],
        ['Beta Haulage', 'draft', 3000],
      ],
    );
    expect(result.value.skipped).toEqual([
      { companyId: gamma, name: 'Gamma Ltd', reason: 'nothing_to_bill' },
    ]);
    expect(result.value.created.every((i) => i.number === undefined)).toBe(true);
  });

  it('is safe to run twice: a company already invoiced for the month is left alone', async () => {
    const { deps, invoices } = await setup();
    await generateInvoices(deps, admin, staffId, '2026-10');
    const again = await generateInvoices(deps, admin, staffId, '2026-10');
    expect(again.ok && again.value.created).toEqual([]);
    expect(
      again.ok && again.value.skipped.filter((s) => s.reason === 'already_invoiced'),
    ).toHaveLength(2);
    expect(await invoices.list()).toHaveLength(2);
  });

  it('refuses a month that has not started, a bad month, and anyone but an admin', async () => {
    const { deps } = await setup();
    expect(await generateInvoices(deps, admin, staffId, '2026-12')).toEqual({
      ok: false,
      error: { tag: 'MonthNotStarted' },
    });
    expect((await generateInvoices(deps, admin, staffId, '2026-11')).ok).toBe(true);
    expect(await generateInvoices(deps, admin, staffId, 'soon')).toEqual({
      ok: false,
      error: { tag: 'InvalidMonth' },
    });
    expect(await generateInvoices(deps, manager, staffId, '2026-10')).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await listInvoices(deps, manager)).ok).toBe(false);
  });
});

describe('editing a draft', () => {
  it('adds a credit as a negative line and takes any line away again', async () => {
    const { deps } = await setup();
    const draft = await draftFor(deps);
    const withCredit = await addManualLine(deps, admin, draft.id, {
      description: 'Goodwill credit',
      amountPence: -1000,
    });
    expect(withCredit.ok && totalPence(withCredit.value.lines)).toBe(4000);
    const line = withCredit.ok ? withCredit.value.lines[1] : undefined;
    const without = await removeLine(deps, admin, draft.id, line!.id);
    expect(without.ok && totalPence(without.value.lines)).toBe(5000);
  });

  it('refuses a blank or fractional line', async () => {
    const { deps } = await setup();
    const draft = await draftFor(deps);
    expect(
      await addManualLine(deps, admin, draft.id, { description: ' ', amountPence: 100 }),
    ).toEqual({
      ok: false,
      error: { tag: 'InvalidLine' },
    });
  });

  it('lets a draft be thrown away, to be generated afresh', async () => {
    const { deps, invoices } = await setup();
    const draft = await draftFor(deps);
    expect((await deleteDraft(deps, admin, draft.id)).ok).toBe(true);
    expect(await invoices.findById(draft.id)).toBeNull();
    const again = await generateInvoices(deps, admin, staffId, '2026-10');
    expect(again.ok && again.value.created.map((i) => i.companyName)).toEqual(['Acme Freight']);
  });
});

describe('issueInvoice', () => {
  it('is refused while WagonWise’s billing details still hold placeholders, naming them', async () => {
    const { deps, invoices } = await setup();
    const draft = await draftFor(deps);
    const result = await issueInvoice(deps, admin, draft.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      tag: 'BillingDetailsIncomplete',
      fields: expect.arrayContaining(['tradingName', 'paymentDetails']) as string[],
    });
    expect((await invoices.findById(draft.id))?.status).toBe('draft');
  });

  it('numbers invoices in order, stamps the details as they were, and freezes the invoice', async () => {
    const { deps, details } = await setup();
    await details.save(real, staffId, new Date());
    const [first, second] = [
      await draftFor(deps, acme),
      await draftFor(deps, beta).catch(() => undefined),
    ];
    expect(second).toBeUndefined(); // generating twice leaves the second run with nothing new
    const issued = await issueInvoice(deps, admin, first.id);
    expect(issued.ok && issued.value).toMatchObject({
      status: 'issued',
      number: 'INV-0001',
      issuedDetails: real,
    });

    // A later change of name does not touch the invoice already sent.
    await details.save({ ...real, tradingName: 'Renamed Ltd' }, staffId, new Date());
    expect((await getInvoice(deps, admin, first.id)).ok).toBe(true);
    const sent = await getInvoice(deps, admin, first.id);
    expect(sent.ok && sent.value.issuedDetails?.tradingName).toBe('WagonWise Ltd');

    // It can no longer be edited, deleted or issued again.
    const frozen = { ok: false, error: { tag: 'InvalidInvoiceState', status: 'issued' } };
    expect(
      await addManualLine(deps, admin, first.id, { description: 'x', amountPence: 1 }),
    ).toEqual(frozen);
    expect(await deleteDraft(deps, admin, first.id)).toEqual(frozen);
    expect(await issueInvoice(deps, admin, first.id)).toEqual(frozen);
  });

  it('gives the next invoice the next number', async () => {
    const { deps, details } = await setup();
    await details.save(real, staffId, new Date());
    await generateInvoices(deps, admin, staffId, '2026-10');
    const all = await listInvoices(deps, admin);
    const ids = all.ok ? all.value.map((i) => i.id) : [];
    const numbers: (string | undefined)[] = [];
    for (const id of ids) {
      const issued = await issueInvoice(deps, admin, id);
      numbers.push(issued.ok ? issued.value.number : undefined);
    }
    expect(numbers.sort()).toEqual(['INV-0001', 'INV-0002']);
  });

  it('refuses an invoice with no lines or a negative total', async () => {
    const { deps, details } = await setup();
    await details.save(real, staffId, new Date());
    const draft = await draftFor(deps);
    const emptied = await removeLine(deps, admin, draft.id, draft.lines[0]!.id);
    expect(emptied.ok).toBe(true);
    expect(await issueInvoice(deps, admin, draft.id)).toEqual({
      ok: false,
      error: { tag: 'EmptyInvoice' },
    });
    await addManualLine(deps, admin, draft.id, { description: 'Credit', amountPence: -100 });
    expect(await issueInvoice(deps, admin, draft.id)).toEqual({
      ok: false,
      error: { tag: 'NegativeTotal' },
    });
  });

  it('refuses a manager', async () => {
    const { deps, details } = await setup();
    await details.save(real, staffId, new Date());
    const draft = await draftFor(deps);
    expect(await issueInvoice(deps, manager, draft.id)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('paying and voiding', () => {
  async function issued() {
    const s = await setup();
    await s.details.save(real, staffId, new Date());
    const draft = await draftFor(s.deps);
    await issueInvoice(s.deps, admin, draft.id);
    return { ...s, id: draft.id };
  }

  it('marks an issued invoice paid, and then it can no longer be voided', async () => {
    const { deps, id } = await issued();
    const paid = await markInvoicePaid(deps, admin, id);
    expect(paid.ok && paid.value.status).toBe('paid');
    expect(await voidInvoice(deps, admin, id)).toEqual({
      ok: false,
      error: { tag: 'InvalidInvoiceState', status: 'paid' },
    });
  });

  it('voids an issued invoice, keeps its number, and lets the month be invoiced again', async () => {
    const { deps, id } = await issued();
    const voided = await voidInvoice(deps, admin, id);
    expect(voided.ok && voided.value).toMatchObject({ status: 'void', number: 'INV-0001' });
    const again = await generateInvoices(deps, admin, staffId, '2026-10');
    expect(again.ok && again.value.created.map((i) => i.companyName)).toContain('Acme Freight');
    // The replacement is issued under a new number: the voided one's is never reused.
    const replacement = again.ok
      ? again.value.created.find((i) => i.companyId === acme)
      : undefined;
    const reissued = await issueInvoice(deps, admin, replacement!.id);
    expect(reissued.ok && reissued.value.number).toBe('INV-0002');
  });

  it('will not pay or void a draft', async () => {
    const { deps } = await setup();
    const draft = await draftFor(deps);
    const state = { ok: false, error: { tag: 'InvalidInvoiceState', status: 'draft' } };
    expect(await markInvoicePaid(deps, admin, draft.id)).toEqual(state);
    expect(await voidInvoice(deps, admin, draft.id)).toEqual(state);
  });
});
