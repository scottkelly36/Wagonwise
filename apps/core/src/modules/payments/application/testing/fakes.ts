import type { Collection, PaymentCustomer, PaymentEvent } from '../../domain/payment-event.js';
import type { InvoiceLedger } from '../ports/directories.js';
import type { PaymentProvider, ReadEventResult } from '../ports/payment-provider.js';
import type {
  CollectionRepository,
  PaymentCustomerRepository,
  ProcessedEventRepository,
} from '../ports/repositories.js';

/** The signature a test message must carry for the fake provider to accept it. */
export const FAKE_SIGNATURE = 'fake-signature';

/**
 * A payment provider for tests: messages are JSON `PaymentEvent`s with `FAKE_SIGNATURE`, a setup session is a made-up URL, and every
 * collect is recorded. `failCollect` makes it refuse to be asked.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  available = true;
  failCollect = false;
  readonly setups: { companyId: string; returnUrl: string }[] = [];
  readonly collected: { invoiceId: string; amountPence: number }[] = [];

  createSetupSession(input: { companyId: string; companyName: string; returnUrl: string }) {
    this.setups.push({ companyId: input.companyId, returnUrl: input.returnUrl });
    return Promise.resolve({
      url: `https://pay.example.test/setup/${input.companyId}`,
      providerRef: `cus_${input.companyId}`,
    });
  }

  collect(input: { invoiceId: string; amountPence: number }) {
    if (this.failCollect) return Promise.reject(new Error('provider down'));
    this.collected.push({ invoiceId: input.invoiceId, amountPence: input.amountPence });
    return Promise.resolve({ providerRef: `pi_${input.invoiceId}` });
  }

  readEvent(input: { body: string; signature: string | undefined }): ReadEventResult {
    if (input.signature !== FAKE_SIGNATURE) return { ok: false };
    try {
      const parsed = JSON.parse(input.body) as PaymentEvent | { kind: 'ignored' };
      return {
        ok: true,
        event: parsed.kind === ('ignored' as string) ? null : (parsed as PaymentEvent),
      };
    } catch {
      return { ok: false };
    }
  }
}

export class InMemoryPaymentCustomers implements PaymentCustomerRepository {
  readonly rows = new Map<string, PaymentCustomer>();

  get(companyId: string) {
    return Promise.resolve(this.rows.get(companyId) ?? null);
  }

  upsert(input: {
    companyId: string;
    provider: string;
    providerRef?: string | null | undefined;
    detailsOnFile?: boolean | undefined;
    at: Date;
  }) {
    const before = this.rows.get(input.companyId);
    this.rows.set(input.companyId, {
      companyId: input.companyId,
      provider: input.provider,
      providerRef: input.providerRef ?? before?.providerRef ?? null,
      detailsOnFile: input.detailsOnFile ?? before?.detailsOnFile ?? false,
      updatedAt: input.at,
    });
    return Promise.resolve();
  }
}

export class InMemoryCollections implements CollectionRepository {
  readonly rows: Collection[] = [];

  open(collection: Collection) {
    if (this.rows.some((r) => r.invoiceId === collection.invoiceId && r.status === 'requested')) {
      return Promise.resolve(false);
    }
    this.rows.push(collection);
    return Promise.resolve(true);
  }

  settle(invoiceId: string, status: 'paid' | 'failed', at: Date, failureReason?: string) {
    const wanted = (r: Collection) =>
      r.invoiceId === invoiceId &&
      (status === 'paid' ? r.status !== 'paid' : r.status === 'requested');
    const i = this.rows.findLastIndex(wanted);
    const row = this.rows[i];
    if (row !== undefined) {
      this.rows[i] = {
        ...row,
        status,
        settledAt: at,
        failureReason: status === 'paid' ? null : (failureReason ?? null),
      };
    }
    return Promise.resolve();
  }

  listForCompany(companyId: string, limit: number) {
    return Promise.resolve(
      this.rows
        .filter((r) => r.companyId === companyId)
        .slice(-limit)
        .reverse(),
    );
  }
}

export class InMemoryProcessedEvents implements ProcessedEventRepository {
  readonly ids = new Set<string>();

  has(eventId: string) {
    return Promise.resolve(this.ids.has(eventId));
  }

  add(eventId: string) {
    this.ids.add(eventId);
    return Promise.resolve();
  }
}

/** A ledger of invoices for tests. */
export class FakeLedger implements InvoiceLedger {
  readonly invoices = new Map<
    string,
    {
      id: string;
      companyId: string;
      number: string | undefined;
      status: 'draft' | 'issued' | 'paid' | 'void';
      totalPence: number;
    }
  >();

  find(invoiceId: string) {
    return Promise.resolve(this.invoices.get(invoiceId) ?? null);
  }

  countUnpaid(companyId: string) {
    return Promise.resolve(
      [...this.invoices.values()].filter((i) => i.companyId === companyId && i.status === 'issued')
        .length,
    );
  }

  settle(invoiceId: string) {
    const invoice = this.invoices.get(invoiceId);
    if (invoice === undefined) return Promise.resolve('not_found' as const);
    if (invoice.status === 'paid') return Promise.resolve('already_paid' as const);
    if (invoice.status !== 'issued') return Promise.resolve('not_issued' as const);
    this.invoices.set(invoiceId, { ...invoice, status: 'paid' });
    return Promise.resolve('paid' as const);
  }
}
