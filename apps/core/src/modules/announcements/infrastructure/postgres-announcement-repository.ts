import { sql, type Kysely } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { AnnouncementRepository } from '../application/announcements.js';
import type { Announcement, AnnouncementId } from '../domain/announcement.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

interface AnnouncementRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly published_at: Date;
  readonly published_by: string;
}

const toAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: makeId<'AnnouncementId'>(r.id),
  title: r.title,
  body: r.body,
  publishedAt: r.published_at,
  publishedBy: r.published_by,
});

/** Raw `sql` like every repository here (decision 26). Nothing here belongs to a company (migration 0090), so there is no row-level policy. */
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
      select id, title, body, published_at, published_by
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
}
