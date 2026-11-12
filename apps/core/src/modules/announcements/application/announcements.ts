import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  checkAnnouncement,
  type Announcement,
  type AnnouncementId,
  type InvalidAnnouncement,
} from '../domain/announcement.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type NotFound = TaggedError<'NotFound'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

export interface AnnouncementRepository {
  insert(announcement: Announcement): Promise<void>;
  /** Newest first, at most `limit`. */
  listNewest(limit: number): Promise<Announcement[]>;
  findLatest(): Promise<Announcement | null>;
  /** Whether it was there to remove. */
  delete(id: AnnouncementId): Promise<boolean>;
}

export interface AnnouncementDeps {
  readonly announcements: AnnouncementRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** How many the portal lists: the newest are the ones that matter. */
export const LIST_LIMIT = 50;

/** Writes a note to the drivers. WagonWise staff only. */
export async function createAnnouncement(
  deps: AnnouncementDeps,
  caller: StaffCaller,
  staffId: string,
  input: { readonly title: string; readonly body: string },
): Promise<Result<Announcement, Forbidden | InvalidAnnouncement>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const checked = checkAnnouncement(input);
  if (!checked.ok) return checked;
  const announcement: Announcement = {
    id: makeId<'AnnouncementId'>(deps.ids.newId()),
    title: checked.value.title,
    body: checked.value.body,
    publishedAt: deps.clock.now(),
    publishedBy: staffId,
  };
  await deps.announcements.insert(announcement);
  return ok(announcement);
}

/** The notes written so far, newest first. WagonWise staff only. */
export async function listAnnouncements(
  deps: Pick<AnnouncementDeps, 'announcements'>,
  caller: StaffCaller,
): Promise<Result<Announcement[], Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return ok(await deps.announcements.listNewest(LIST_LIMIT));
}

/** Takes a note back, such as one written by mistake. WagonWise staff only. */
export async function deleteAnnouncement(
  deps: Pick<AnnouncementDeps, 'announcements'>,
  caller: StaffCaller,
  id: AnnouncementId,
): Promise<Result<null, Forbidden | NotFound>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return (await deps.announcements.delete(id)) ? ok(null) : err({ tag: 'NotFound' });
}

/** The newest note, for the driver app. Any signed-in driver; `null` when there has never been one. */
export function latestAnnouncement(
  deps: Pick<AnnouncementDeps, 'announcements'>,
): Promise<Announcement | null> {
  return deps.announcements.findLatest();
}
