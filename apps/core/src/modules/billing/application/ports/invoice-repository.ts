import type { BillingDetails, StaffId } from '../../domain/billing-details.js';
import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceLineId,
  MonthString,
} from '../../domain/invoice.js';
import type { CompanyId } from '../../domain/plan.js';

export interface InvoiceRepository {
  findById(id: InvoiceId): Promise<Invoice | null>;
  /** Newest month first, then by company name. */
  list(): Promise<Invoice[]>;
  /** The company's invoice for the month that is not void, if there is one. */
  findLive(companyId: CompanyId, month: MonthString): Promise<Invoice | null>;
  /** A company's own invoices that have been issued (never its drafts), newest month first. */
  listIssuedForCompany(companyId: CompanyId): Promise<Invoice[]>;
  /** A new draft with its lines. */
  insertDraft(invoice: Invoice, createdBy: StaffId): Promise<void>;
  addLine(invoiceId: InvoiceId, line: InvoiceLine): Promise<void>;
  removeLine(invoiceId: InvoiceId, lineId: InvoiceLineId): Promise<void>;
  deleteDraft(id: InvoiceId): Promise<void>;
  /** The next invoice number's sequence, counting up with no gaps; part of the same transaction as the issue. */
  nextSequence(): Promise<number>;
  markIssued(
    id: InvoiceId,
    issue: { number: string; sequence: number; at: Date; details: BillingDetails },
  ): Promise<void>;
  markPaid(id: InvoiceId, at: Date): Promise<void>;
  markVoid(id: InvoiceId, at: Date): Promise<void>;
}
