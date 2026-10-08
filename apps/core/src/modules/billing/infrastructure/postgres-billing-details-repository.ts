import { sql } from 'kysely';
import type {
  BillingDetailsRepository,
  StoredBillingDetails,
} from '../application/ports/billing-details-repository.js';
import type { BillingDetails, StaffId } from '../domain/billing-details.js';
import type { UntypedDb } from './db.js';

interface Row {
  readonly trading_name: string;
  readonly address: string;
  readonly contact_email: string;
  readonly payment_details: string;
  readonly vat_status: string;
  readonly payment_terms: string;
  readonly updated_at: Date;
}

/** Raw `sql` like every other repository here (decision 26). The table holds one row, seeded by
 *  migration 0039, and Row-Level Security lets only the platform scope see it. */
export class PostgresBillingDetailsRepository implements BillingDetailsRepository {
  constructor(private readonly db: UntypedDb) {}

  async get(): Promise<StoredBillingDetails> {
    const { rows } = await sql<Row>`
      select trading_name, address, contact_email, payment_details, vat_status, payment_terms, updated_at
      from billing.details
    `.execute(this.db);
    const row = rows[0];
    if (!row) throw new Error('billing.details has no row: migration 0039 seeds it');
    return {
      details: {
        tradingName: row.trading_name,
        address: row.address,
        contactEmail: row.contact_email,
        paymentDetails: row.payment_details,
        vatStatus: row.vat_status,
        paymentTerms: row.payment_terms,
      },
      updatedAt: row.updated_at,
    };
  }

  async save(details: BillingDetails, updatedBy: StaffId, at: Date): Promise<void> {
    await sql`
      update billing.details set
        trading_name = ${details.tradingName}, address = ${details.address},
        contact_email = ${details.contactEmail}, payment_details = ${details.paymentDetails},
        vat_status = ${details.vatStatus}, payment_terms = ${details.paymentTerms},
        updated_at = ${at}, updated_by = ${updatedBy}
    `.execute(this.db);
  }
}
