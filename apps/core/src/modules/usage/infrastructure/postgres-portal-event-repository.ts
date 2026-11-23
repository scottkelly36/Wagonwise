import { sql } from 'kysely';
import type { PortalEventRepository } from '../application/portal-events.js';
import type { PortalEvent } from '../domain/portal-event.js';
import type { UntypedDb } from './postgres-usage-reader.js';

/** Raw `sql` (decision 26). The table has row-level security: a write runs in the signed-in person's company scope, the sweep and the
 *  report in a WagonWise staff scope. */
export class PostgresPortalEventRepository implements PortalEventRepository {
  constructor(private readonly db: UntypedDb) {}

  /** One statement for the whole batch (at most 50, the contract's limit). */
  async insert(events: readonly PortalEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map(
      (e) =>
        sql`(${e.id}, ${e.companyId}, ${e.sessionId}, ${e.event}, ${e.page ?? null}, ${e.form ?? null}, ${e.field ?? null}, ${e.problem ?? null}, ${e.at})`,
    );
    await sql`
      insert into usage.portal_events (id, company_id, session_id, event, page, form, field, problem, at)
      values ${sql.join(rows)}
    `.execute(this.db);
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    const result = await sql`delete from usage.portal_events where at < ${cutoff}`.execute(this.db);
    return Number(result.numAffectedRows ?? 0);
  }
}
