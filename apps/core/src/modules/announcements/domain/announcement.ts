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
}

export type InvalidAnnouncement = TaggedError<'InvalidAnnouncement'>;

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
