import type { Announcement, AnnouncementId } from '../../domain/announcement.js';
import type {
  AnnouncementAudience,
  AnnouncementPusher,
  AnnouncementRepository,
  PushPreferences,
  PushReport,
  PushTarget,
} from '../announcements.js';
import type { PushMessage } from '../../domain/announcement.js';

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

  lastPushAt(): Promise<Date | null> {
    const times = this.items.flatMap((a) =>
      a.pushedAt === undefined ? [] : [a.pushedAt.getTime()],
    );
    return Promise.resolve(times.length === 0 ? null : new Date(Math.max(...times)));
  }

  recordPush(id: AnnouncementId, at: Date, accepted: number): Promise<void> {
    const index = this.items.findIndex((a) => a.id === id);
    const found = this.items[index];
    if (found !== undefined) this.items[index] = { ...found, pushedAt: at, pushedTo: accepted };
    return Promise.resolve();
  }

  delete(id: AnnouncementId): Promise<boolean> {
    const index = this.items.findIndex((a) => a.id === id);
    if (index < 0) return Promise.resolve(false);
    this.items.splice(index, 1);
    return Promise.resolve(true);
  }
}

export class InMemoryPushPreferences implements PushPreferences {
  readonly optedOut = new Set<string>();

  setOptedOut(driverId: string, optedOut: boolean): Promise<void> {
    if (optedOut) this.optedOut.add(driverId);
    else this.optedOut.delete(driverId);
    return Promise.resolve();
  }

  isOptedOut(driverId: string): Promise<boolean> {
    return Promise.resolve(this.optedOut.has(driverId));
  }

  listOptedOut(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.optedOut));
  }

  erase(driverId: string): Promise<void> {
    this.optedOut.delete(driverId);
    return Promise.resolve();
  }
}

export class FakeAnnouncementAudience implements AnnouncementAudience {
  targets: PushTarget[] = [];

  listPushTargets(): Promise<readonly PushTarget[]> {
    return Promise.resolve(this.targets);
  }
}

export class FakeAnnouncementPusher implements AnnouncementPusher {
  readonly sent: { readonly tokens: readonly string[]; readonly message: PushMessage }[] = [];
  /** How many of the tokens the fake push service takes. Defaults to all of them. */
  acceptOnly: number | undefined;
  fail = false;

  send(tokens: readonly string[], message: PushMessage): Promise<PushReport> {
    if (this.fail) return Promise.reject(new Error('push service down'));
    this.sent.push({ tokens, message });
    return Promise.resolve({
      devices: tokens.length,
      accepted: this.acceptOnly ?? tokens.length,
    });
  }
}
