import { sql, type Kysely } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { AnnouncementRepository, PushPreferences } from '../application/announcements.js';
import type { Announcement, AnnouncementId } from '../domain/announcement.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

interface AnnouncementRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly published_at: Date;
  readonly published_by: string;
  readonly pushed_at: Date | null;
  readonly pushed_to: number | null;
}

const toAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: makeId<'AnnouncementId'>(r.id),
  title: r.title,
  body: r.body,
  publishedAt: r.published_at,
  publishedBy: r.published_by,
  pushedAt: r.pushed_at ?? undefined,
  pushedTo: r.pushed_to ?? undefined,
});

/** Raw `sql` like every repository here (decision 26). Nothing here belongs to a company (migrations 0090, 0091), so there is no row-level policy. */
export class PostgresAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly db: UntypedDb) {}

  async insert(a: Announcement): Promise<void> {
    await sql`
      insert into announcements.announcements (id, title, body, published_at, published_by)
      values (${a.id}, ${a.title}, ${a.body}, ${a.publishedAt}, ${a.publishedBy})
    `.execute(this.db);
  }

  async listNewest(limit: number): Promise<Announcement[]> {
    const { rows } = await sql<AnnouncementRow>`
      select id, title, body, published_at, published_by, pushed_at, pushed_to
      from announcements.announcements order by published_at desc, id limit ${limit}
    `.execute(this.db);
    return rows.map(toAnnouncement);
  }

  async findLatest(): Promise<Announcement | null> {
    const [latest] = await this.listNewest(1);
    return latest ?? null;
  }

  async delete(id: AnnouncementId): Promise<boolean> {
    const result = await sql`delete from announcements.announcements where id = ${id}`.execute(
      this.db,
    );
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  async lastPushAt(): Promise<Date | null> {
    const { rows } = await sql<{ last: Date | null }>`
      select max(pushed_at) as last from announcements.announcements
    `.execute(this.db);
    return rows[0]?.last ?? null;
  }

  async recordPush(id: AnnouncementId, at: Date, accepted: number): Promise<void> {
    await sql`
      update announcements.announcements set pushed_at = ${at}, pushed_to = ${accepted} where id = ${id}
    `.execute(this.db);
  }
}

/** Each driver's choice to switch notifications off: a row means off. */
export class PostgresPushPreferences implements PushPreferences {
  constructor(private readonly db: UntypedDb) {}

  async setOptedOut(driverId: string, optedOut: boolean, at: Date): Promise<void> {
    if (optedOut) {
      await sql`
        insert into announcements.push_opt_outs (driver_id, opted_out_at) values (${driverId}, ${at})
        on conflict (driver_id) do nothing
      `.execute(this.db);
    } else {
      await this.erase(driverId);
    }
  }

  async isOptedOut(driverId: string): Promise<boolean> {
    const { rows } = await sql`
      select 1 from announcements.push_opt_outs where driver_id = ${driverId}
    `.execute(this.db);
    return rows.length > 0;
  }

  async listOptedOut(): Promise<ReadonlySet<string>> {
    const { rows } = await sql<{ driver_id: string }>`
      select driver_id from announcements.push_opt_outs
    `.execute(this.db);
    return new Set(rows.map((r) => r.driver_id));
  }

  async erase(driverId: string): Promise<void> {
    await sql`delete from announcements.push_opt_outs where driver_id = ${driverId}`.execute(
      this.db,
    );
  }
}
