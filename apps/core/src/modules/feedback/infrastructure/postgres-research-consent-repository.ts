import { sql } from 'kysely';
import type { ResearchConsentRepository } from '../application/ports/research-consent-repository.js';
import type { ResearchConsent } from '../domain/research-consent.js';
import type { UntypedDb } from './db.js';

interface Row {
  readonly id: string;
  readonly staff_id: string;
  readonly company_id: string;
  readonly agreed: boolean;
  readonly wording_version: number;
  readonly at: Date;
}

const toConsent = (r: Row): ResearchConsent => ({
  id: r.id,
  staffId: r.staff_id,
  companyId: r.company_id,
  agreed: r.agreed,
  wordingVersion: r.wording_version,
  at: r.at,
});

/** Raw `sql` (decision 26). The table has row-level security: a person's own scope adds and reads their company's rows; WagonWise staff's scope reads all. */
export class PostgresResearchConsentRepository implements ResearchConsentRepository {
  constructor(private readonly db: UntypedDb) {}

  async add(c: ResearchConsent): Promise<void> {
    await sql`
      insert into feedback.research_consent (id, staff_id, company_id, agreed, wording_version, at)
      values (${c.id}, ${c.staffId}, ${c.companyId}, ${c.agreed}, ${c.wordingVersion}, ${c.at})
    `.execute(this.db);
  }

  async latest(staffId: string): Promise<ResearchConsent | null> {
    const { rows } = await sql<Row>`
      select id, staff_id, company_id, agreed, wording_version, at
      from feedback.research_consent where staff_id = ${staffId}
      order by at desc, id desc limit 1
    `.execute(this.db);
    const row = rows[0];
    return row === undefined ? null : toConsent(row);
  }

  async latestAgreed(): Promise<readonly ResearchConsent[]> {
    const { rows } = await sql<Row>`
      select id, staff_id, company_id, agreed, wording_version, at from (
        select distinct on (staff_id) id, staff_id, company_id, agreed, wording_version, at
        from feedback.research_consent order by staff_id, at desc, id desc
      ) latest
      where agreed order by at desc
    `.execute(this.db);
    return rows.map(toConsent);
  }
}
