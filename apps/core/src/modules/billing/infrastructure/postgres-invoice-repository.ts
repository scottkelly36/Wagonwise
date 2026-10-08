import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { InvoiceRepository } from '../application/ports/invoice-repository.js';
import type { BillingDetails, StaffId } from '../domain/billing-details.js';
import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceLineId,
  InvoiceStatus,
  MonthString,
} from '../domain/invoice.js';
import type { CompanyId } from '../domain/plan.js';
import type { UntypedDb } from './db.js';

interface InvoiceRow {
  readonly id: string;
  readonly company_id: string;
  readonly company_name: string;
  readonly month: string;
  readonly status: InvoiceStatus;
  readonly number: string | null;
  readonly created_at: Date;
  readonly issued_at: Date | null;
  readonly paid_at: Date | null;
  readonly voided_at: Date | null;
  readonly issued_details: BillingDetails | null;
}

interface LineRow {
  readonly id: string;
  readonly invoice_id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit_pence: number;
  readonly amount_pence: number;
}

const INVOICE_COLUMNS = `id, company_id, company_name, month, status, number, created_at, issued_at,
  paid_at, voided_at, issued_details`;

function toInvoice(row: InvoiceRow, lines: readonly LineRow[]): Invoice {
  return {
    id: makeId<'InvoiceId'>(row.id),
    companyId: makeId<'CompanyId'>(row.company_id),
    companyName: row.company_name,
    month: row.month,
    status: row.status,
    number: row.number ?? undefined,
    lines: lines.map((l): InvoiceLine => ({
      id: makeId<'InvoiceLineId'>(l.id),
      description: l.description,
      quantity: l.quantity,
      unitPence: l.unit_pence,
      amountPence: l.amount_pence,
    })),
    createdAt: row.created_at,
    issuedAt: row.issued_at ?? undefined,
    paidAt: row.paid_at ?? undefined,
    voidedAt: row.voided_at ?? undefined,
    issuedDetails: row.issued_details ?? undefined,
  };
}

/** Raw `sql` like every other repository here (decision 26). One request is one transaction (the data
 *  scope), so the invoice counter and the issue it numbers commit or roll back together. */
export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: InvoiceId): Promise<Invoice | null> {
    const { rows } = await sql<InvoiceRow>`
      select ${sql.raw(INVOICE_COLUMNS)} from billing.invoices where id = ${id}
    `.execute(this.db);
    return this.#withLines(rows).then((all) => all[0] ?? null);
  }

  async list(): Promise<Invoice[]> {
    const { rows } = await sql<InvoiceRow>`
      select ${sql.raw(INVOICE_COLUMNS)} from billing.invoices
      order by month desc, company_name, created_at
    `.execute(this.db);
    return this.#withLines(rows);
  }

  async findLive(companyId: CompanyId, month: MonthString): Promise<Invoice | null> {
    const { rows } = await sql<InvoiceRow>`
      select ${sql.raw(INVOICE_COLUMNS)} from billing.invoices
      where company_id = ${companyId} and month = ${month} and status <> 'void'
    `.execute(this.db);
    return this.#withLines(rows).then((all) => all[0] ?? null);
  }

  async listIssuedForCompany(companyId: CompanyId): Promise<Invoice[]> {
    const { rows } = await sql<InvoiceRow>`
      select ${sql.raw(INVOICE_COLUMNS)} from billing.invoices
      where company_id = ${companyId} and status <> 'draft'
      order by month desc, created_at desc
    `.execute(this.db);
    return this.#withLines(rows);
  }

  async insertDraft(invoice: Invoice, createdBy: StaffId): Promise<void> {
    await sql`
      insert into billing.invoices (id, company_id, company_name, month, status, created_at, created_by)
      values (${invoice.id}, ${invoice.companyId}, ${invoice.companyName}, ${invoice.month}, 'draft',
              ${invoice.createdAt}, ${createdBy})
    `.execute(this.db);
    for (const [index, line] of invoice.lines.entries()) {
      await sql`
        insert into billing.invoice_lines
          (id, invoice_id, position, description, quantity, unit_pence, amount_pence)
        values (${line.id}, ${invoice.id}, ${index + 1}, ${line.description}, ${line.quantity},
                ${line.unitPence}, ${line.amountPence})
      `.execute(this.db);
    }
  }

  async addLine(invoiceId: InvoiceId, line: InvoiceLine): Promise<void> {
    await sql`
      insert into billing.invoice_lines
        (id, invoice_id, position, description, quantity, unit_pence, amount_pence)
      select ${line.id}, ${invoiceId}, coalesce(max(position), 0) + 1, ${line.description},
             ${line.quantity}, ${line.unitPence}, ${line.amountPence}
      from billing.invoice_lines where invoice_id = ${invoiceId}
    `.execute(this.db);
  }

  async removeLine(invoiceId: InvoiceId, lineId: InvoiceLineId): Promise<void> {
    await sql`
      delete from billing.invoice_lines where invoice_id = ${invoiceId} and id = ${lineId}
    `.execute(this.db);
  }

  async deleteDraft(id: InvoiceId): Promise<void> {
    // Lines go with it (on delete cascade). Only a draft: an issued invoice is voided, never deleted.
    await sql`delete from billing.invoices where id = ${id} and status = 'draft'`.execute(this.db);
  }

  async nextSequence(): Promise<number> {
    const { rows } = await sql<{ last_seq: number }>`
      update billing.invoice_counter set last_seq = last_seq + 1 returning last_seq
    `.execute(this.db);
    const row = rows[0];
    if (!row) throw new Error('billing.invoice_counter has no row: migration 0041 seeds it');
    return row.last_seq;
  }

  async markIssued(
    id: InvoiceId,
    issue: { number: string; sequence: number; at: Date; details: BillingDetails },
  ): Promise<void> {
    await sql`
      update billing.invoices set status = 'issued', number = ${issue.number}, seq = ${issue.sequence},
        issued_at = ${issue.at}, issued_details = ${JSON.stringify(issue.details)}::jsonb
      where id = ${id} and status = 'draft'
    `.execute(this.db);
  }

  async markPaid(id: InvoiceId, at: Date): Promise<void> {
    await sql`
      update billing.invoices set status = 'paid', paid_at = ${at} where id = ${id} and status = 'issued'
    `.execute(this.db);
  }

  async markVoid(id: InvoiceId, at: Date): Promise<void> {
    await sql`
      update billing.invoices set status = 'void', voided_at = ${at} where id = ${id} and status = 'issued'
    `.execute(this.db);
  }

  async #withLines(rows: readonly InvoiceRow[]): Promise<Invoice[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const { rows: lines } = await sql<LineRow>`
      select id, invoice_id, description, quantity, unit_pence, amount_pence
      from billing.invoice_lines where invoice_id in (${sql.join(ids)}) order by position
    `.execute(this.db);
    return rows.map((row) =>
      toInvoice(
        row,
        lines.filter((l) => l.invoice_id === row.id),
      ),
    );
  }
}
