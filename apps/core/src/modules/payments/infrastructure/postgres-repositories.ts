import { sql, type Kysely } from 'kysely';
import type {
  CollectionRepository,
  PaymentCustomerRepository,
  ProcessedEventRepository,
} from '../application/ports/repositories.js';
import type { Collection, CollectionStatus, PaymentCustomer } from '../domain/payment-event.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

/** Raw `sql` (decision 26). The tables have row-level security: a company reads and writes its own `customers` row in its own scope; everything
 *  else is WagonWise staff's scope. */
export class PostgresPaymentCustomerRepository implements PaymentCustomerRepository {
  constructor(private readonly db: UntypedDb) {}

  async get(companyId: string): Promise<PaymentCustomer | null> {
    const { rows } = await sql<{
      company_id: string;
      provider: string;
      provider_ref: string | null;
      details_on_file: boolean;
      updated_at: Date;
    }>`
      select company_id, provider, provider_ref, details_on_file, updated_at
      from payments.customers where company_id = ${companyId}
    `.execute(this.db);
    const r = rows[0];
    return r === undefined
      ? null
      : {
          companyId: r.company_id,
          provider: r.provider,
          providerRef: r.provider_ref,
          detailsOnFile: r.details_on_file,
          updatedAt: r.updated_at,
        };
  }

  async upsert(input: {
    companyId: string;
    provider: string;
    providerRef?: string | null | undefined;
    detailsOnFile?: boolean | undefined;
    at: Date;
  }): Promise<void> {
    await sql`
      insert into payments.customers (company_id, provider, provider_ref, details_on_file, updated_at)
      values (${input.companyId}, ${input.provider}, ${input.providerRef ?? null}, ${input.detailsOnFile ?? false}, ${input.at})
      on conflict (company_id) do update set
        provider = excluded.provider,
        provider_ref = coalesce(excluded.provider_ref, payments.customers.provider_ref),
        details_on_file = ${input.detailsOnFile === undefined ? sql`payments.customers.details_on_file` : sql`excluded.details_on_file`},
        updated_at = excluded.updated_at
    `.execute(this.db);
  }
}

export class PostgresCollectionRepository implements CollectionRepository {
  constructor(private readonly db: UntypedDb) {}

  async open(
    collection: Collection & { providerRef?: string | null | undefined },
  ): Promise<boolean> {
    const { rows } = await sql<{ id: string }>`
      insert into payments.collections
        (id, company_id, invoice_id, amount_pence, status, requested_by, requested_at, provider_ref)
      values (${collection.id}, ${collection.companyId}, ${collection.invoiceId}, ${collection.amountPence}, 'requested',
              ${collection.requestedBy}, ${collection.requestedAt}, ${collection.providerRef ?? null})
      on conflict do nothing
      returning id
    `.execute(this.db);
    return rows.length === 1;
  }

  async settle(
    invoiceId: string,
    status: Exclude<CollectionStatus, 'requested'>,
    at: Date,
    failureReason?: string,
  ): Promise<void> {
    // A failure closes the open attempt. Money received closes the latest attempt that is not already paid, even one closed as failed
    // (a mismatched message, or a retry the provider made on its own), so the record ends up saying what happened.
    await sql`
      update payments.collections
      set status = ${status}, settled_at = ${at}, failure_reason = ${status === 'paid' ? null : (failureReason?.slice(0, 500) ?? null)}
      where id = (
        select id from payments.collections
        where invoice_id = ${invoiceId} and ${status === 'paid' ? sql`status <> 'paid'` : sql`status = 'requested'`}
        order by requested_at desc limit 1
      )
    `.execute(this.db);
  }

  async listForCompany(companyId: string, limit: number): Promise<readonly Collection[]> {
    const { rows } = await sql<{
      id: string;
      company_id: string;
      invoice_id: string;
      amount_pence: number;
      status: CollectionStatus;
      requested_by: string | null;
      requested_at: Date;
      settled_at: Date | null;
      failure_reason: string | null;
    }>`
      select id, company_id, invoice_id, amount_pence, status, requested_by, requested_at, settled_at, failure_reason
      from payments.collections where company_id = ${companyId}
      order by requested_at desc limit ${limit}
    `.execute(this.db);
    return rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      invoiceId: r.invoice_id,
      amountPence: r.amount_pence,
      status: r.status,
      requestedBy: r.requested_by,
      requestedAt: r.requested_at,
      settledAt: r.settled_at,
      failureReason: r.failure_reason,
    }));
  }
}

export class PostgresProcessedEventRepository implements ProcessedEventRepository {
  constructor(private readonly db: UntypedDb) {}

  async has(eventId: string): Promise<boolean> {
    const { rows } = await sql<{ event_id: string }>`
      select event_id from payments.processed_events where event_id = ${eventId}
    `.execute(this.db);
    return rows.length > 0;
  }

  async add(eventId: string, kind: string, at: Date): Promise<void> {
    await sql`
      insert into payments.processed_events (event_id, kind, received_at)
      values (${eventId}, ${kind}, ${at}) on conflict do nothing
    `.execute(this.db);
  }
}
