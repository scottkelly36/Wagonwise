import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { BillingDetails } from '../domain/billing-details.js';
import type { Invoice } from '../domain/invoice.js';
import type { UntypedDb } from './db.js';
import { PostgresInvoiceRepository } from './postgres-invoice-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const admin = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const at = new Date('2026-11-02T09:00:00.000Z');

const details: BillingDetails = {
  tradingName: 'WagonWise Ltd',
  address: '1 High Street, Hexham',
  contactEmail: 'billing@example.com',
  paymentDetails: 'Sort code 00-00-00, account 00000000',
  vatStatus: 'Not VAT registered',
  paymentTerms: '14 days',
};

let n = 0;
const uuid = (): string => `a${String(++n).padStart(7, '0')}-0000-4000-8000-000000000000`;

function draft(companyId = acme, month = '2026-10'): Invoice {
  return {
    id: makeId<'InvoiceId'>(uuid()),
    companyId,
    companyName: companyId === acme ? 'Acme Freight' : 'Beta Haulage',
    month,
    status: 'draft',
    number: undefined,
    lines: [
      {
        id: makeId<'InvoiceLineId'>(uuid()),
        description: '5 vehicles covered, October 2026',
        quantity: 5,
        unitPence: 1000,
        amountPence: 5000,
      },
    ],
    createdAt: at,
    issuedAt: undefined,
    paidAt: undefined,
    voidedAt: undefined,
    issuedDetails: undefined,
  };
}

describe('PostgresInvoiceRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const repo = () => new PostgresInvoiceRepository(db);

  it('round-trips a draft with its lines in order, and adds and removes a line', async () => {
    const invoice = draft(acme, '2026-07');
    await repo().insertDraft(invoice, admin);
    expect(await repo().findById(invoice.id)).toEqual(invoice);

    const credit = {
      id: makeId<'InvoiceLineId'>(uuid()),
      description: 'Goodwill credit',
      quantity: 1,
      unitPence: -500,
      amountPence: -500,
    };
    await repo().addLine(invoice.id, credit);
    expect((await repo().findById(invoice.id))?.lines.map((l) => l.amountPence)).toEqual([
      5000, -500,
    ]);
    await repo().removeLine(invoice.id, credit.id);
    expect((await repo().findById(invoice.id))?.lines).toHaveLength(1);
  });

  it('numbers issues 1, 2, 3 and stamps the billing details, which come back whole', async () => {
    const first = draft(acme, '2026-08');
    const second = draft(beta, '2026-08');
    await repo().insertDraft(first, admin);
    await repo().insertDraft(second, admin);

    for (const invoice of [first, second]) {
      const sequence = await repo().nextSequence();
      await repo().markIssued(invoice.id, {
        number: `INV-${String(sequence).padStart(4, '0')}`,
        sequence,
        at,
        details,
      });
    }
    const [one, two] = [await repo().findById(first.id), await repo().findById(second.id)];
    expect(one).toMatchObject({ status: 'issued', number: 'INV-0001', issuedAt: at });
    expect(one?.issuedDetails).toEqual(details);
    expect(two?.number).toBe('INV-0002');
  });

  it('allows one live invoice per company per month; a void one frees the month', async () => {
    const first = draft(acme, '2026-09');
    await repo().insertDraft(first, admin);
    await expect(repo().insertDraft(draft(acme, '2026-09'), admin)).rejects.toThrow(
      /invoices_one_live_per_month_idx/,
    );
    expect((await repo().findLive(acme, '2026-09'))?.id).toBe(first.id);

    const sequence = await repo().nextSequence();
    await repo().markIssued(first.id, { number: `INV-${sequence}`, sequence, at, details });
    await repo().markVoid(first.id, at);
    expect(await repo().findLive(acme, '2026-09')).toBeNull();
    await repo().insertDraft(draft(acme, '2026-09'), admin);
    expect(await repo().findLive(acme, '2026-09')).not.toBeNull();
  });

  it('marks an issued invoice paid, but will not pay or void a draft', async () => {
    const invoice = draft(beta, '2026-06');
    await repo().insertDraft(invoice, admin);
    await repo().markPaid(invoice.id, at);
    await repo().markVoid(invoice.id, at);
    expect((await repo().findById(invoice.id))?.status).toBe('draft');

    const sequence = await repo().nextSequence();
    await repo().markIssued(invoice.id, { number: `INV-${sequence}`, sequence, at, details });
    await repo().markPaid(invoice.id, at);
    expect(await repo().findById(invoice.id)).toMatchObject({ status: 'paid', paidAt: at });
  });

  it('deletes a draft with its lines, but never an issued invoice', async () => {
    const gone = draft(acme, '2026-05');
    await repo().insertDraft(gone, admin);
    await repo().deleteDraft(gone.id);
    expect(await repo().findById(gone.id)).toBeNull();
    const { rows } = await pool.query('select 1 from billing.invoice_lines where invoice_id = $1', [
      gone.id,
    ]);
    expect(rows).toHaveLength(0);

    const kept = draft(beta, '2026-05');
    await repo().insertDraft(kept, admin);
    const sequence = await repo().nextSequence();
    await repo().markIssued(kept.id, { number: `INV-${sequence}`, sequence, at, details });
    await repo().deleteDraft(kept.id);
    expect(await repo().findById(kept.id)).not.toBeNull();
  });

  it('lists newest month first', async () => {
    const months = (await repo().list()).map((i) => i.month);
    expect(months).toEqual([...months].sort().reverse());
  });

  it('lists a company’s issued invoices only: no drafts, nobody else’s', async () => {
    const mine = draft(acme, '2026-03');
    const myDraft = draft(acme, '2026-04');
    const theirs = draft(beta, '2026-03');
    for (const invoice of [mine, myDraft, theirs]) await repo().insertDraft(invoice, admin);
    for (const invoice of [mine, theirs]) {
      const sequence = await repo().nextSequence();
      await repo().markIssued(invoice.id, { number: `INV-${sequence}`, sequence, at, details });
    }
    const listed = await repo().listIssuedForCompany(acme);
    expect(listed.map((i) => i.id)).toContain(mine.id);
    expect(listed.map((i) => i.id)).not.toContain(myDraft.id);
    expect(listed.map((i) => i.id)).not.toContain(theirs.id);
    expect(listed.every((i) => i.companyId === acme && i.status !== 'draft')).toBe(true);
    expect(listed.find((i) => i.id === mine.id)?.lines).toHaveLength(1);
  });
});
