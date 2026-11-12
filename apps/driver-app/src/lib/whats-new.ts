import type { AnnouncementDto } from '@wagonwise/contracts/announcements';

/** A note older than this is not shown as news: a driver who installs the app later has not missed anything this note is about. */
export const WHATS_NEW_MAX_AGE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether to show the newest note: there is one, this driver has not seen it, it is recent, and an update is not still waiting for a restart (the note
 * may be about what that update brings, which the driver does not have yet).
 */
export function shouldShowWhatsNew(input: {
  readonly announcement: AnnouncementDto | null | undefined;
  readonly seenId: string | undefined;
  readonly updateWaiting: boolean;
  readonly now?: Date;
}): boolean {
  const { announcement, seenId, updateWaiting } = input;
  if (announcement === null || announcement === undefined) return false;
  if (updateWaiting || announcement.id === seenId) return false;
  const age = (input.now ?? new Date()).getTime() - Date.parse(announcement.publishedAt);
  return Number.isFinite(age) && age <= WHATS_NEW_MAX_AGE_DAYS * DAY_MS;
}

/** The points of a note: one to a line, blank lines dropped. */
export function whatsNewPoints(body: string): readonly string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
