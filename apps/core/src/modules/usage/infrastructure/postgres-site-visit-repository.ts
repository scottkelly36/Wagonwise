import { sql } from 'kysely';
import type { SiteVisit, SiteVisitRepository } from '../application/site-visits.js';
import type { UntypedDb } from './postgres-usage-reader.js';

/** Migration 0098. Raw `sql` like every repository here (decision 26). */
export class PostgresSiteVisitRepository implements SiteVisitRepository {
  constructor(private readonly db: UntypedDb) {}

  async insert(v: SiteVisit): Promise<void> {
    await sql`
      insert into usage.site_visits (id, kind, page, source, campaign, at)
      values (${v.id}, ${v.kind}, ${v.page}, ${v.source ?? null}, ${v.campaign ?? null}, ${v.at})
    `.execute(this.db);
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    const result = await sql`delete from usage.site_visits where at < ${cutoff}`.execute(this.db);
    return Number(result.numAffectedRows ?? 0);
  }
}
