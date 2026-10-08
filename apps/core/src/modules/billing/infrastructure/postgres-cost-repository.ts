import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { CostRepository } from '../application/ports/cost-repository.js';
import type { StaffId } from '../domain/billing-details.js';
import type { Cost, CostCategory, CostId } from '../domain/finance.js';
import type { MonthString } from '../domain/invoice.js';
import type { UntypedDb } from './db.js';

interface CostRow {
  readonly id: string;
  readonly category: CostCategory;
  readonly description: string;
  readonly amount_pence: number;
  readonly from_month: string;
  readonly to_month: string | null;
}

const toCost = (row: CostRow): Cost => ({
  id: makeId<'CostId'>(row.id),
  category: row.category,
  description: row.description,
  amountPence: row.amount_pence,
  fromMonth: row.from_month,
  toMonth: row.to_month ?? undefined,
});

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0048) lets only the
 *  platform scope see any of it. */
export class PostgresCostRepository implements CostRepository {
  constructor(private readonly db: UntypedDb) {}

  async list(): Promise<Cost[]> {
    const { rows } = await sql<CostRow>`
      select id, category, description, amount_pence, from_month, to_month
      from billing.costs order by from_month, created_at
    `.execute(this.db);
    return rows.map(toCost);
  }

  async findById(id: CostId): Promise<Cost | null> {
    const { rows } = await sql<CostRow>`
      select id, category, description, amount_pence, from_month, to_month
      from billing.costs where id = ${id}
    `.execute(this.db);
    return rows[0] ? toCost(rows[0]) : null;
  }

  async insert(cost: Cost, by: StaffId, at: Date): Promise<void> {
    await sql`
      insert into billing.costs
        (id, category, description, amount_pence, from_month, to_month, created_at, created_by)
      values (${cost.id}, ${cost.category}, ${cost.description}, ${cost.amountPence}, ${cost.fromMonth},
              ${cost.toMonth ?? null}, ${at}, ${by})
    `.execute(this.db);
  }

  async updateFields(
    id: CostId,
    fields: { category: CostCategory; description: string; amountPence: number },
  ): Promise<void> {
    await sql`
      update billing.costs set category = ${fields.category}, description = ${fields.description},
        amount_pence = ${fields.amountPence}
      where id = ${id}
    `.execute(this.db);
  }

  async setToMonth(id: CostId, toMonth: MonthString | undefined): Promise<void> {
    await sql`update billing.costs set to_month = ${toMonth ?? null} where id = ${id}`.execute(
      this.db,
    );
  }

  async delete(id: CostId): Promise<void> {
    await sql`delete from billing.costs where id = ${id}`.execute(this.db);
  }
}
