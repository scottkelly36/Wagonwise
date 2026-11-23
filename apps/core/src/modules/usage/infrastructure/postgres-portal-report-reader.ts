import { sql } from 'kysely';
import {
  PORTAL_REPORT_DAYS,
  SETTING_UP_DAYS,
  type PortalReport,
  type PortalReportReader,
} from '../application/portal-report.js';
import type { UntypedDb } from './postgres-usage-reader.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads the portal's usage from `usage.portal_events`, and how far each new company has got from the tables it was set up in (the usage
 * report reads across schemas the same way). Counts only, no person. Needs a WagonWise staff scope: the events have row-level security.
 */
export class PostgresPortalReportReader implements PortalReportReader {
  constructor(private readonly db: UntypedDb) {}

  async read(now: Date): Promise<PortalReport> {
    const since = new Date(now.getTime() - PORTAL_REPORT_DAYS * DAY_MS);
    const settingUpSince = new Date(now.getTime() - SETTING_UP_DAYS * DAY_MS);

    const totals = await sql<{ sessions: number; firms: number }>`
      select count(distinct session_id)::int as sessions, count(distinct company_id)::int as firms
      from usage.portal_events where at >= ${since}
    `.execute(this.db);

    const pages = await sql<{ page: string; sessions: number }>`
      select page, count(distinct session_id)::int as sessions
      from usage.portal_events
      where event = 'page_viewed' and at >= ${since}
      group by page order by sessions desc
    `.execute(this.db);

    const forms = await sql<{
      form: string;
      opened: number;
      sent: number;
      left: number;
      errors: number;
    }>`
      select form,
        count(*) filter (where event = 'form_opened')::int as opened,
        count(*) filter (where event = 'form_sent')::int as sent,
        count(*) filter (where event = 'form_left')::int as left,
        count(*) filter (where event = 'form_error')::int as errors
      from usage.portal_events
      where form is not null and at >= ${since}
      group by form
    `.execute(this.db);

    // For each send, the latest opening of the same form in the same sitting before it.
    const medians = await sql<{ form: string; median: number | null }>`
      select form, percentile_cont(0.5) within group (order by secs)::float8 as median
      from (
        select s.form, extract(epoch from (s.at - o.opened_at)) as secs
        from usage.portal_events s
        join lateral (
          select max(p.at) as opened_at from usage.portal_events p
          where p.session_id = s.session_id and p.form = s.form
            and p.event = 'form_opened' and p.at <= s.at
        ) o on o.opened_at is not null
        where s.event = 'form_sent' and s.at >= ${since}
      ) t
      group by form
    `.execute(this.db);
    const medianByForm = new Map(medians.rows.map((r) => [r.form, r.median]));

    const errorFields = await sql<{
      form: string;
      field: string;
      problem: string;
      count: number;
    }>`
      select form, field, problem, count(*)::int as count
      from usage.portal_events
      where event = 'form_error' and at >= ${since}
      group by form, field, problem
      order by count desc, form, field limit 15
    `.execute(this.db);

    const settingUp = await sql<{
      id: string;
      name: string;
      created_at: Date;
      vehicles: number;
      drivers: number;
      jobs: number;
      last_seen: Date | null;
    }>`
      select c.id, c.name, c.created_at,
        (select count(*) from fleet.vehicles v where v.company_id = c.id)::int as vehicles,
        (select count(*) from fleet.driver_links l where l.company_id = c.id and l.status = 'active')::int as drivers,
        (select count(*) from jobs.jobs j where j.company_id = c.id)::int as jobs,
        (select max(e.at) from usage.portal_events e where e.company_id = c.id) as last_seen
      from companies.companies c
      where c.created_at >= ${settingUpSince}
        and not exists (select 1 from jobs.jobs j where j.company_id = c.id)
      order by c.created_at desc
    `.execute(this.db);

    return {
      windowDays: PORTAL_REPORT_DAYS,
      sessions: totals.rows[0]?.sessions ?? 0,
      firms: totals.rows[0]?.firms ?? 0,
      pages: pages.rows,
      forms: forms.rows.map((r) => ({
        ...r,
        medianSecondsToSend: medianByForm.get(r.form) ?? null,
      })),
      errorFields: errorFields.rows,
      settingUp: settingUp.rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        vehicles: r.vehicles,
        drivers: r.drivers,
        jobs: r.jobs,
        lastSeenAt: r.last_seen,
      })),
    };
  }
}
