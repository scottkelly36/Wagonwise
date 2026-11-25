import { sql } from 'kysely';
import type { DraftRunRepository } from '../application/ports/draft-run-repository.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0108) lets only WagonWise staff in. */
export class PostgresDraftRunRepository implements DraftRunRepository {
  constructor(private readonly db: UntypedDb) {}

  async has(month: string): Promise<boolean> {
    const { rows } = await sql<{ month: string }>`
      select month from billing.draft_runs where month = ${month}
    `.execute(this.db);
    return rows.length > 0;
  }

  async record(run: {
    readonly month: string;
    readonly ranAt: Date;
    readonly drafts: number;
    readonly totalPence: number;
  }): Promise<void> {
    await sql`
      insert into billing.draft_runs (month, ran_at, drafts, total_pence)
      values (${run.month}, ${run.ranAt}, ${run.drafts}, ${run.totalPence})
      on conflict (month) do nothing
    `.execute(this.db);
  }
}
