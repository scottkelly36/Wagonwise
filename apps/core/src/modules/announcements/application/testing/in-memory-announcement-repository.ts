import type { Announcement, AnnouncementId } from '../../domain/announcement.js';
import type { AnnouncementRepository } from '../announcements.js';

export class InMemoryAnnouncementRepository implements AnnouncementRepository {
  readonly items: Announcement[] = [];

  async insert(announcement: Announcement): Promise<void> {
    this.items.push(announcement);
  }

  private newestFirst(): Announcement[] {
    return [...this.items].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  async listNewest(limit: number): Promise<Announcement[]> {
    return this.newestFirst().slice(0, limit);
  }

  async findLatest(): Promise<Announcement | null> {
    return this.newestFirst()[0] ?? null;
  }

  async delete(id: AnnouncementId): Promise<boolean> {
    const index = this.items.findIndex((a) => a.id === id);
    if (index < 0) return false;
    this.items.splice(index, 1);
    return true;
  }
}
