import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type AnnouncementId = Id<'AnnouncementId'>;

export const TITLE_MAX = 80;
export const BODY_MAX = 600;

/** A note from WagonWise to its drivers about what has changed in the app. */
export interface Announcement {
  readonly id: AnnouncementId;
  readonly title: string;
  /** Plain text; a line break starts a new point. */
  readonly body: string;
  readonly publishedAt: Date;
  /** The staff account that wrote it. */
  readonly publishedBy: string;
  /** When it was sent as a notification, and to how many phones the push service accepted it. Absent when it was not sent. */
  readonly pushedAt?: Date | undefined;
  readonly pushedTo?: number | undefined;
}

export type InvalidAnnouncement = TaggedError<'InvalidAnnouncement'>;
/** A notification went out too recently: drivers are not sent these more than once in a few days, whatever staff choose. */
export type PushTooSoon = TaggedError<'PushTooSoon'>;

/** The least time between two notifications to drivers. A note can still be published without one. */
export const PUSH_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether a notification may go out now, given when the last one did. */
export function pushAllowed(lastPushAt: Date | null, now: Date): boolean {
  return lastPushAt === null || now.getTime() - lastPushAt.getTime() >= PUSH_COOLDOWN_MS;
}

/** Trims both, and refuses an empty one or one longer than a card or a notification can carry. */
export function checkAnnouncement(input: {
  readonly title: string;
  readonly body: string;
}): Result<{ readonly title: string; readonly body: string }, InvalidAnnouncement> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length === 0 || title.length > TITLE_MAX) return err({ tag: 'InvalidAnnouncement' });
  if (body.length === 0 || body.length > BODY_MAX) return err({ tag: 'InvalidAnnouncement' });
  return ok({ title, body });
}

/** The most a notification's text carries: a phone shows about this much before cutting it off. */
export const PUSH_BODY_MAX = 140;

export interface PushMessage {
  readonly title: string;
  readonly body: string;
  readonly data: { readonly type: 'announcement'; readonly announcementId: string };
}

/**
 * What a notification says: the note's heading, and its first point cut to fit. The rest is on the card the driver sees when they open the app, so
 * the notification is a reason to open it, not the whole message. It carries the note's id, so the app knows what it is about and does nothing else.
 */
export function pushMessageFor(
  announcement: Pick<Announcement, 'id' | 'title' | 'body'>,
): PushMessage {
  const first =
    announcement.body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? announcement.title;
  const body =
    first.length <= PUSH_BODY_MAX ? first : `${first.slice(0, PUSH_BODY_MAX - 1).trimEnd()}…`;
  return {
    title: announcement.title,
    body,
    data: { type: 'announcement', announcementId: announcement.id },
  };
}
