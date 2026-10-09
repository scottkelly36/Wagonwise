import { sql, type Kysely } from 'kysely';
import type { Activity, UsageFirm, UsageReader, UsageReport } from '../application/usage.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

/** The UK calendar day of `at`, as `YYYY-MM-DD`. */
const ukDay = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(at);

interface ActivityRow {
  readonly total: number;
  readonly never: number;
  readonly a24: number;
  readonly a7: number;
  readonly a30: number;
}

const toActivity = (r: ActivityRow | undefined): Activity => ({
  total: r?.total ?? 0,
  neverSignedIn: r?.never ?? 0,
  active24h: r?.a24 ?? 0,
  active7d: r?.a7 ?? 0,
  active30d: r?.a30 ?? 0,
});

type WeekRow = { week: string; count: number };

/**
 * The read-model adapter for the usage report (AGENTS.md rule 7): raw SQL across the schemas it summarises, counts only.
 * Runs in the platform scope, where Row-Level Security lets every table be read.
 */
export class PostgresUsageReader implements UsageReader {
  constructor(private readonly db: UntypedDb) {}

  async read(now: Date): Promise<UsageReport> {
    const db = this.db;
    const today = ukDay(now);

    const drivers = await sql<ActivityRow>`
      select count(*)::int as total,
             count(*) filter (where s.last is null)::int as never,
             count(*) filter (where s.last >= ${now}::timestamptz - interval '24 hours')::int as a24,
             count(*) filter (where s.last >= ${now}::timestamptz - interval '7 days')::int as a7,
             count(*) filter (where s.last >= ${now}::timestamptz - interval '30 days')::int as a30
      from identity.drivers d
      left join (select driver_id, max(last_used_at) as last from identity.sessions group by driver_id) s
        on s.driver_id = d.id`.execute(db);

    const staff = await sql<ActivityRow>`
      select count(*)::int as total,
             count(*) filter (where s.last is null)::int as never,
             count(*) filter (where s.last >= ${now}::timestamptz - interval '24 hours')::int as a24,
             count(*) filter (where s.last >= ${now}::timestamptz - interval '7 days')::int as a7,
             count(*) filter (where s.last >= ${now}::timestamptz - interval '30 days')::int as a30
      from companies.staff_accounts a
      left join (select staff_id, max(last_used_at) as last from companies.staff_sessions group by staff_id) s
        on s.staff_id = a.id
      where a.removed_at is null`.execute(db);

    const counts = await sql<{ devices: number; running: number; testers: number }>`
      select (select count(*) from identity.devices)::int as devices,
             (select count(*) from routing.active_trips where ended_at is null)::int as running,
             (select count(*) from signups.testers)::int as testers`.execute(db);

    const tripsPerDay = await sql<{ day: string; count: number }>`
      select to_char(d.day, 'YYYY-MM-DD') as day, count(t.id)::int as count
      from generate_series(${today}::date - 13, ${today}::date, interval '1 day') as d(day)
      left join routing.active_trips t
        on (t.started_at at time zone 'Europe/London')::date = d.day::date
      group by d.day order by d.day`.execute(db);

    const created = await sql<WeekRow>`
      select to_char(w.week, 'YYYY-MM-DD') as week, count(j.id)::int as count
      from generate_series(date_trunc('week', ${today}::date)::date - 49, date_trunc('week', ${today}::date)::date, interval '7 days') as w(week)
      left join jobs.jobs j
        on date_trunc('week', j.created_at at time zone 'Europe/London')::date = w.week::date
      group by w.week order by w.week`.execute(db);

    const delivered = await sql<WeekRow>`
      with done as (
        select (e.entry->>'at')::timestamptz as at
        from jobs.jobs j, jsonb_array_elements(j.timeline) as e(entry)
        where j.status = 'delivered' and e.entry->>'status' = 'delivered'
      )
      select to_char(w.week, 'YYYY-MM-DD') as week, count(done.at)::int as count
      from generate_series(date_trunc('week', ${today}::date)::date - 49, date_trunc('week', ${today}::date)::date, interval '7 days') as w(week)
      left join done
        on date_trunc('week', done.at at time zone 'Europe/London')::date = w.week::date
      group by w.week order by w.week`.execute(db);

    const checks = await sql<WeekRow>`
      select to_char(w.week, 'YYYY-MM-DD') as week, count(c.id)::int as count
      from generate_series(date_trunc('week', ${today}::date)::date - 49, date_trunc('week', ${today}::date)::date, interval '7 days') as w(week)
      left join checks.checks c
        on date_trunc('week', c.check_day::timestamp)::date = w.week::date
      group by w.week order by w.week`.execute(db);

    const firms = await sql<{
      id: string;
      name: string;
      drivers: number;
      vehicles: number;
      staff: number;
      jobs: number;
      last_active: Date | null;
    }>`
      select c.id, c.name,
        (select count(*) from fleet.driver_links l where l.company_id = c.id and l.status = 'active')::int as drivers,
        (select count(*) from fleet.vehicles v where v.company_id = c.id)::int as vehicles,
        (select count(*) from companies.staff_accounts s where s.company_id = c.id and s.removed_at is null)::int as staff,
        (select count(*) from jobs.jobs j where j.company_id = c.id
           and j.created_at >= date_trunc('month', ${now}::timestamptz at time zone 'Europe/London') at time zone 'Europe/London')::int as jobs,
        greatest(
          (select max(ss.last_used_at) from companies.staff_sessions ss
             join companies.staff_accounts s on s.id = ss.staff_id where s.company_id = c.id),
          (select max(ds.last_used_at) from identity.sessions ds
             join fleet.driver_links l on l.driver_id = ds.driver_id and l.company_id = c.id and l.status = 'active')
        ) as last_active
      from companies.companies c
      order by last_active desc nulls last, c.name`.execute(db);

    const week = (rows: WeekRow[]) => rows.map((r) => ({ weekStart: r.week, count: r.count }));
    const c = counts.rows[0];
    return {
      generatedAt: now,
      drivers: toActivity(drivers.rows[0]),
      staff: toActivity(staff.rows[0]),
      devices: c?.devices ?? 0,
      tripsRunningNow: c?.running ?? 0,
      tripsPerDay: tripsPerDay.rows,
      jobsCreatedPerWeek: week(created.rows),
      jobsDeliveredPerWeek: week(delivered.rows),
      checksPerWeek: week(checks.rows),
      testers: c?.testers ?? 0,
      firms: firms.rows.map((r): UsageFirm => ({
        id: r.id,
        name: r.name,
        drivers: r.drivers,
        vehicles: r.vehicles,
        staff: r.staff,
        jobsThisMonth: r.jobs,
        lastActiveAt: r.last_active,
      })),
    };
  }
}
