import { sql } from 'kysely';
import type { FlowEventRepository } from '../application/flow-events.js';
import type { FlowEvent } from '../domain/flow-event.js';
import type { UntypedDb } from './postgres-usage-reader.js';

export class PostgresFlowEventRepository implements FlowEventRepository {
  constructor(private readonly db: UntypedDb) {}

  /** One statement for the whole batch (at most 50, the contract's limit). */
  async insert(events: readonly FlowEvent[]): Promise<void> {
    if (events.length === 0) return;
    const rows = events.map(
      (e) =>
        sql`(${e.id}, ${e.sessionId}, ${e.event}, ${e.choice ?? null}, ${e.appVersion}, ${e.platform}, ${e.updateDate ?? null}::date, ${e.at})`,
    );
    await sql`
      insert into usage.flow_events (id, session_id, event, choice, app_version, platform, update_date, at)
      values ${sql.join(rows)}
    `.execute(this.db);
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    const result = await sql`delete from usage.flow_events where at < ${cutoff}`.execute(this.db);
    return Number(result.numAffectedRows ?? 0);
  }
}
