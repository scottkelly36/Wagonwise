import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { PaymentEvent } from '../domain/payment-event.js';
import {
  collectInvoice,
  getCompanyPayments,
  getOwnPaymentStatus,
  handlePaymentMessage,
  startPaymentSetup,
  type PaymentsDeps,
} from './payments.js';
import type { StaffCaller } from './ports/directories.js';
import {
  FAKE_SIGNATURE,
  FakeLedger,
  FakePaymentProvider,
  InMemoryCollections,
  InMemoryPaymentCustomers,
  InMemoryProcessedEvents,
} from './testing/fakes.js';

const ACME = 'company-acme';
const BETA = 'company-beta';
const INV = 'invoice-1';
const platform: StaffCaller = { kind: 'platform', staffId: 'admin' };
const billing: StaffCaller = {
  kind: 'fleet',
  staffId: 'boss',
  companyId: ACME,
  privileges: ['manage_billing'],
};
const dispatcher: StaffCaller = {
  kind: 'fleet',
  staffId: 'disp',
  companyId: ACME,
  privileges: ['dispatch'],
};

let provider: FakePaymentProvider;
let customers: InMemoryPaymentCustomers;
let collections: InMemoryCollections;
let processed: InMemoryProcessedEvents;
let ledger: FakeLedger;
let facts: { companyId: string; kind: string; owesAnything: boolean }[];
let notices: string[];
let deps: PaymentsDeps;

const message = (event: PaymentEvent | { kind: 'ignored' }, signature = FAKE_SIGNATURE) => ({
  body: JSON.stringify(event),
  signature,
});

const issue = (id = INV, companyId = ACME, totalPence = 1500) =>
  ledger.invoices.set(id, { id, companyId, number: 'INV-0001', status: 'issued', totalPence });

beforeEach(() => {
  provider = new FakePaymentProvider();
  customers = new InMemoryPaymentCustomers();
  collections = new InMemoryCollections();
  processed = new InMemoryProcessedEvents();
  ledger = new FakeLedger();
  facts = [];
  notices = [];
  deps = {
    provider,
    customers,
    collections,
    processed,
    ledger,
    accounts: {
      record: (companyId, fact) => {
        facts.push({ companyId, ...fact });
        return Promise.resolve();
      },
    },
    names: { nameOf: () => Promise.resolve('Acme Haulage') },
    ownerNotice: {
      send: (subject) => {
        notices.push(subject);
        return Promise.resolve();
      },
    },
    dashboardUrl: 'https://portal.example.test/',
    clock: new FakeClock('2026-12-01T10:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
});

describe('payment status and adding payment details', () => {
  it('is for the people holding billing, for their own company', async () => {
    expect(await getOwnPaymentStatus(deps, billing)).toEqual({
      ok: true,
      value: { available: true, detailsOnFile: false },
    });
    expect(await getOwnPaymentStatus(deps, dispatcher)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await getOwnPaymentStatus(deps, platform)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('a second visit hands back the customer the provider already has, so none is made twice', async () => {
    await startPaymentSetup(deps, billing);
    await startPaymentSetup(deps, billing);
    expect(provider.existingRefs).toEqual([null, `cus_${ACME}`]);
  });

  it('a different customer than the one kept clears "on file": the old details belonged to a customer that could not be used', async () => {
    await customers.upsert({
      companyId: ACME,
      provider: 'fake',
      providerRef: 'cus_made_under_the_other_mode',
      detailsOnFile: true,
      at: new Date('2026-11-20T09:00:00Z'),
    });
    await startPaymentSetup(deps, billing);
    expect(customers.rows.get(ACME)).toMatchObject({
      providerRef: `cus_${ACME}`,
      detailsOnFile: false,
    });
  });

  it('the same customer coming back leaves "on file" as it was', async () => {
    await customers.upsert({
      companyId: ACME,
      provider: 'fake',
      providerRef: `cus_${ACME}`,
      detailsOnFile: true,
      at: new Date('2026-11-20T09:00:00Z'),
    });
    await startPaymentSetup(deps, billing);
    expect(customers.rows.get(ACME)?.detailsOnFile).toBe(true);
  });

  it("starts the provider's hosted page, coming back to the plan page, and charges nothing", async () => {
    const result = await startPaymentSetup(deps, billing);
    expect(result).toEqual({ ok: true, value: { url: `https://pay.example.test/setup/${ACME}` } });
    expect(provider.setups).toEqual([
      { companyId: ACME, returnUrl: 'https://portal.example.test/staff/plan?payment=done' },
    ]);
    expect(provider.collected).toEqual([]);
    // Not on file until the provider says the person finished.
    expect(await getOwnPaymentStatus(deps, billing)).toMatchObject({
      value: { detailsOnFile: false },
    });
  });

  it('says so when no provider is connected, and offers nothing', async () => {
    provider.available = false;
    expect(await startPaymentSetup(deps, billing)).toEqual({
      ok: false,
      error: { tag: 'NotAvailable' },
    });
    expect(await getOwnPaymentStatus(deps, billing)).toMatchObject({ value: { available: false } });
    expect(provider.setups).toEqual([]);
  });

  it('refuses someone who does not hold billing', async () => {
    expect(await startPaymentSetup(deps, dispatcher)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('collecting an invoice', () => {
  beforeEach(async () => {
    issue();
    await customers.upsert({
      companyId: ACME,
      provider: 'fake',
      providerRef: `cus_${ACME}`,
      detailsOnFile: true,
      at: new Date(),
    });
  });

  it('asks the provider for the invoice total, and opens one attempt', async () => {
    expect(await collectInvoice(deps, platform, INV)).toEqual({
      ok: true,
      value: { amountPence: 1500 },
    });
    expect(provider.collected).toEqual([{ invoiceId: INV, amountPence: 1500 }]);
    expect(collections.rows).toHaveLength(1);
    expect(collections.rows[0]).toMatchObject({ status: 'requested', requestedBy: 'admin' });
  });

  it('tells the provider which attempt this is and which customer it is for, so a repeat cannot charge twice', async () => {
    await collectInvoice(deps, platform, INV);
    expect(provider.attempts).toEqual([
      { attemptId: collections.rows[0]?.id, customerRef: `cus_${ACME}` },
    ]);
  });

  it('will not collect twice while an attempt is open: pressing the button twice cannot charge twice', async () => {
    await collectInvoice(deps, platform, INV);
    expect(await collectInvoice(deps, platform, INV)).toEqual({
      ok: false,
      error: { tag: 'AlreadyCollecting' },
    });
    expect(provider.collected).toHaveLength(1);
  });

  it('is for WagonWise staff only', async () => {
    expect(await collectInvoice(deps, billing, INV)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(provider.collected).toEqual([]);
  });

  it('refuses an invoice that is not issued, one that does not exist, and a company with no details', async () => {
    ledger.invoices.set('paid', {
      id: 'paid',
      companyId: ACME,
      number: 'INV-2',
      status: 'paid',
      totalPence: 100,
    });
    expect(await collectInvoice(deps, platform, 'paid')).toMatchObject({
      ok: false,
      error: { tag: 'InvoiceNotDue', status: 'paid' },
    });
    expect(await collectInvoice(deps, platform, 'missing')).toEqual({
      ok: false,
      error: { tag: 'InvoiceNotFound' },
    });
    issue('beta-inv', BETA);
    expect(await collectInvoice(deps, platform, 'beta-inv')).toEqual({
      ok: false,
      error: { tag: 'NoPaymentDetails' },
    });
    expect(provider.collected).toEqual([]);
  });

  it('gives the attempt back when the provider cannot be asked, so it can be tried again', async () => {
    provider.failCollect = true;
    expect(await collectInvoice(deps, platform, INV)).toEqual({
      ok: false,
      error: { tag: 'ProviderFailed' },
    });
    expect(collections.rows[0]?.status).toBe('failed');
    provider.failCollect = false;
    expect((await collectInvoice(deps, platform, INV)).ok).toBe(true);
  });

  it('collects nothing when no provider is connected', async () => {
    provider.available = false;
    expect(await collectInvoice(deps, platform, INV)).toEqual({
      ok: false,
      error: { tag: 'NotAvailable' },
    });
  });

  it("shows WagonWise staff a company's details and attempts", async () => {
    await collectInvoice(deps, platform, INV);
    const view = await getCompanyPayments(deps, platform, ACME);
    expect(view.ok && view.value).toMatchObject({ available: true, detailsOnFile: true });
    expect(view.ok && view.value.collections).toHaveLength(1);
    expect(await getCompanyPayments(deps, billing, ACME)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe("the provider's messages", () => {
  it('refuses a message that is not signed, and changes nothing', async () => {
    const outcome = await handlePaymentMessage(
      deps,
      message({ id: 'e1', kind: 'setup_completed', companyId: ACME }, 'wrong'),
    );
    expect(outcome).toBe('invalid_signature');
    expect(customers.rows.size).toBe(0);
    expect(facts).toEqual([]);
  });

  it('acknowledges a genuine message it does not act on, without remembering it', async () => {
    expect(await handlePaymentMessage(deps, message({ kind: 'ignored' }))).toBe('ignored');
  });

  it('details added: marks them on file and tells the account, with whether anything is owed', async () => {
    issue();
    const outcome = await handlePaymentMessage(
      deps,
      message({ id: 'e1', kind: 'setup_completed', companyId: ACME, providerRef: 'cus_1' }),
    );
    expect(outcome).toBe('applied');
    expect(customers.rows.get(ACME)).toMatchObject({ detailsOnFile: true, providerRef: 'cus_1' });
    expect(facts).toEqual([{ companyId: ACME, kind: 'details_added', owesAnything: true }]);
  });

  it('the payment method removed: no longer on file', async () => {
    await customers.upsert({
      companyId: ACME,
      provider: 'fake',
      detailsOnFile: true,
      at: new Date(),
    });
    await handlePaymentMessage(
      deps,
      message({ id: 'e2', kind: 'payment_method_removed', companyId: ACME }),
    );
    expect(customers.rows.get(ACME)?.detailsOnFile).toBe(false);
  });

  it('an invoice paid: marks it paid once, closes the attempt, and tells the account when nothing else is owed', async () => {
    issue();
    await customers.upsert({
      companyId: ACME,
      provider: 'fake',
      detailsOnFile: true,
      at: new Date(),
    });
    await collectInvoice(deps, platform, INV);
    const outcome = await handlePaymentMessage(
      deps,
      message({
        id: 'e3',
        kind: 'payment_succeeded',
        companyId: ACME,
        invoiceId: INV,
        amountPence: 1500,
      }),
    );
    expect(outcome).toBe('applied');
    expect(ledger.invoices.get(INV)?.status).toBe('paid');
    expect(collections.rows[0]).toMatchObject({ status: 'paid' });
    expect(facts).toEqual([{ companyId: ACME, kind: 'paid_in_full', owesAnything: false }]);
  });

  it('says something is still owed when another invoice is unpaid', async () => {
    issue();
    issue('invoice-2');
    await handlePaymentMessage(
      deps,
      message({
        id: 'e4',
        kind: 'payment_succeeded',
        companyId: ACME,
        invoiceId: INV,
        amountPence: 1500,
      }),
    );
    expect(facts).toEqual([{ companyId: ACME, kind: 'paid_in_full', owesAnything: true }]);
  });

  it('a message sent twice is acted on once', async () => {
    issue();
    const paid = message({
      id: 'e5',
      kind: 'payment_succeeded',
      companyId: ACME,
      invoiceId: INV,
      amountPence: 1500,
    });
    expect(await handlePaymentMessage(deps, paid)).toBe('applied');
    expect(await handlePaymentMessage(deps, paid)).toBe('duplicate');
    expect(facts).toHaveLength(1);
  });

  it('a message handled again after a partial failure is safe: the invoice is not paid twice', async () => {
    issue();
    // As if the first attempt settled the invoice and then stopped before remembering the message.
    await ledger.settle(INV);
    const outcome = await handlePaymentMessage(
      deps,
      message({
        id: 'e6',
        kind: 'payment_succeeded',
        companyId: ACME,
        invoiceId: INV,
        amountPence: 1500,
      }),
    );
    expect(outcome).toBe('applied');
    expect(ledger.invoices.get(INV)?.status).toBe('paid');
  });

  it('a paid amount that is not the invoice total changes nothing, and the owner is told', async () => {
    issue();
    const outcome = await handlePaymentMessage(
      deps,
      message({
        id: 'e7',
        kind: 'payment_succeeded',
        companyId: ACME,
        invoiceId: INV,
        amountPence: 1000,
      }),
    );
    expect(outcome).toBe('amount_mismatch');
    expect(ledger.invoices.get(INV)?.status).toBe('issued');
    expect(facts).toEqual([]);
    expect(notices[0]).toContain('is not the amount of the invoice');
  });

  it("a payment for an invoice that is not the company's, or does not exist, changes nothing", async () => {
    issue(INV, BETA);
    expect(
      await handlePaymentMessage(
        deps,
        message({
          id: 'e8',
          kind: 'payment_succeeded',
          companyId: ACME,
          invoiceId: INV,
          amountPence: 1500,
        }),
      ),
    ).toBe('unknown_invoice');
    expect(
      await handlePaymentMessage(
        deps,
        message({
          id: 'e9',
          kind: 'payment_succeeded',
          companyId: ACME,
          invoiceId: 'nope',
          amountPence: 1,
        }),
      ),
    ).toBe('unknown_invoice');
    expect(ledger.invoices.get(INV)?.status).toBe('issued');
    expect(facts).toEqual([]);
  });

  it('a payment that failed closes the attempt as failed, tells the account and the owner', async () => {
    issue();
    await customers.upsert({
      companyId: ACME,
      provider: 'fake',
      detailsOnFile: true,
      at: new Date(),
    });
    await collectInvoice(deps, platform, INV);
    await handlePaymentMessage(
      deps,
      message({
        id: 'e10',
        kind: 'payment_failed',
        companyId: ACME,
        invoiceId: INV,
        reason: 'insufficient funds',
      }),
    );
    expect(collections.rows[0]).toMatchObject({
      status: 'failed',
      failureReason: 'insufficient funds',
    });
    expect(facts).toEqual([{ companyId: ACME, kind: 'payment_failed', owesAnything: true }]);
    expect(notices).toEqual(['A payment failed']);
    expect(ledger.invoices.get(INV)?.status).toBe('issued');
  });
});
