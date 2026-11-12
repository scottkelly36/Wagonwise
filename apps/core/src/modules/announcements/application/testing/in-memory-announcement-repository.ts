import type { Announcement, AnnouncementId } from '../../domain/announcement.js';
import type { AnnouncementRepository } from '../announcements.js';

export class InMemoryAnnouncementRepository implements AnnouncementRepository {
  readonly items: Announcement[] = [];

  insert(announcement: Announcement): Promise<void> {
    this.items.push(announcement);
    return Promise.resolve();
  }

  private newestFirst(): Announcement[] {
    return [...this.items].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  listNewest(limit: number): Promise<Announcement[]> {
    return Promise.resolve(this.newestFirst().slice(0, limit));
  }

  findLatest(): Promise<Announcement | null> {
    return Promise.resolve(this.newestFirst()[0] ?? null);
  }

  delete(id: AnnouncementId): Promise<boolean> {
    const index = this.items.findIndex((a) => a.id === id);
    if (index < 0) return Promise.resolve(false);
    this.items.splice(index, 1);
    return Promise.resolve(true);
  }
}
