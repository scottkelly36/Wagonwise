import type { BillingDetails, StaffId } from '../../domain/billing-details.js';
import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceLineId,
  MonthString,
} from '../../domain/invoice.js';
import type { CompanyId } from '../../domain/plan.js';
import type { InvoiceRepository } from '../ports/invoice-repository.js';

export class InMemoryInvoiceRepository implements InvoiceRepository {
  #byId = new Map<InvoiceId, Invoice>();
  #sequence = 0;

  findById(id: InvoiceId): Promise<Invoice | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  list(): Promise<Invoice[]> {
    return Promise.resolve(
      [...this.#byId.values()].sort(
        (a, b) => b.month.localeCompare(a.month) || a.companyName.localeCompare(b.companyName),
      ),
    );
  }

  findLive(companyId: CompanyId, month: MonthString): Promise<Invoice | null> {
    const found = [...this.#byId.values()].find(
      (i) => i.companyId === companyId && i.month === month && i.status !== 'void',
    );
    return Promise.resolve(found ?? null);
  }

  listIssuedForCompany(companyId: CompanyId): Promise<Invoice[]> {
    return this.list().then((all) =>
      all.filter((i) => i.companyId === companyId && i.status !== 'draft'),
    );
  }

  insertDraft(invoice: Invoice, _createdBy: StaffId): Promise<void> {
    this.#byId.set(invoice.id, invoice);
    return Promise.resolve();
  }

  addLine(invoiceId: InvoiceId, line: InvoiceLine): Promise<void> {
    return this.#update(invoiceId, (i) => ({ ...i, lines: [...i.lines, line] }));
  }

  removeLine(invoiceId: InvoiceId, lineId: InvoiceLineId): Promise<void> {
    return this.#update(invoiceId, (i) => ({
      ...i,
      lines: i.lines.filter((l) => l.id !== lineId),
    }));
  }

  deleteDraft(id: InvoiceId): Promise<void> {
    this.#byId.delete(id);
    return Promise.resolve();
  }

  nextSequence(): Promise<number> {
    this.#sequence += 1;
    return Promise.resolve(this.#sequence);
  }

  markIssued(
    id: InvoiceId,
    issue: { number: string; sequence: number; at: Date; details: BillingDetails },
  ): Promise<void> {
    return this.#update(id, (i) => ({
      ...i,
      status: 'issued',
      number: issue.number,
      issuedAt: issue.at,
      issuedDetails: issue.details,
    }));
  }

  markPaid(id: InvoiceId, at: Date): Promise<void> {
    return this.#update(id, (i) => ({ ...i, status: 'paid', paidAt: at }));
  }

  markVoid(id: InvoiceId, at: Date): Promise<void> {
    return this.#update(id, (i) => ({ ...i, status: 'void', voidedAt: at }));
  }

  #update(id: InvoiceId, change: (invoice: Invoice) => Invoice): Promise<void> {
    const existing = this.#byId.get(id);
    if (existing) this.#byId.set(id, change(existing));
    return Promise.resolve();
  }
}
