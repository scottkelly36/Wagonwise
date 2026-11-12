import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  checkAnnouncement,
  pushAllowed,
  pushMessageFor,
  type Announcement,
  type AnnouncementId,
  type InvalidAnnouncement,
  type PushMessage,
  type PushTooSoon,
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
  /** When a notification last went out, for any note. `null` when none ever has. */
  lastPushAt(): Promise<Date | null>;
  /** Records that the note was sent as a notification, at this time, to this many phones. */
  recordPush(id: AnnouncementId, at: Date, accepted: number): Promise<void>;
}

/** A phone a notification could go to, and the driver it belongs to. Supplied by composition over identity (AGENTS.md rule 7). */
export interface PushTarget {
  readonly driverId: string;
  readonly pushToken: string;
}

export interface AnnouncementAudience {
  listPushTargets(): Promise<readonly PushTarget[]>;
}

export interface PushReport {
  /** How many phones it was sent to. */
  readonly devices: number;
  /** How many of those the push service took. A stale or revoked token is an expected outcome, not an error. */
  readonly accepted: number;
}

export interface AnnouncementPusher {
  send(tokens: readonly string[], message: PushMessage): Promise<PushReport>;
}

/** Each driver's choice to switch notifications from WagonWise off. A driver is on unless they have turned them off. */
export interface PushPreferences {
  setOptedOut(driverId: string, optedOut: boolean, at: Date): Promise<void>;
  isOptedOut(driverId: string): Promise<boolean>;
  listOptedOut(): Promise<ReadonlySet<string>>;
  /** For account deletion. Safe to run twice. */
  erase(driverId: string): Promise<void>;
}

export interface AnnouncementDeps {
  readonly announcements: AnnouncementRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly audience: AnnouncementAudience;
  readonly pusher: AnnouncementPusher;
  readonly preferences: PushPreferences;
}

/** How many the portal lists: the newest are the ones that matter. */
export const LIST_LIMIT = 50;

export interface PublishInput {
  readonly title: string;
  readonly body: string;
  /** Also send it as a notification. */
  readonly push?: boolean | undefined;
}

export interface Published {
  readonly announcement: Announcement;
  /** The note was saved but the notification could not be sent. */
  readonly pushFailed?: true;
}

/**
 * Writes a note to the drivers, and (when asked) sends it as a notification to every phone of a driver who has not turned those off. WagonWise staff only.
 * A notification is refused, and nothing saved, if one went out in the last three days. A notification that fails to send does not lose the note: it is saved
 * and says so, and can be sent later by writing it again.
 */
export async function createAnnouncement(
  deps: AnnouncementDeps,
  caller: StaffCaller,
  staffId: string,
  input: PublishInput,
): Promise<Result<Published, Forbidden | InvalidAnnouncement | PushTooSoon>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const checked = checkAnnouncement(input);
  if (!checked.ok) return checked;
  const now = deps.clock.now();
  if (input.push === true && !pushAllowed(await deps.announcements.lastPushAt(), now)) {
    return err({ tag: 'PushTooSoon' });
  }

  const announcement: Announcement = {
    id: makeId<'AnnouncementId'>(deps.ids.newId()),
    title: checked.value.title,
    body: checked.value.body,
    publishedAt: now,
    publishedBy: staffId,
  };
  await deps.announcements.insert(announcement);
  if (input.push !== true) return ok({ announcement });

  try {
    const [targets, optedOut] = await Promise.all([
      deps.audience.listPushTargets(),
      deps.preferences.listOptedOut(),
    ]);
    const tokens = [
      ...new Set(targets.filter((t) => !optedOut.has(t.driverId)).map((t) => t.pushToken)),
    ];
    // Nobody to tell: nothing was sent, so the limit is not used up.
    if (tokens.length === 0) return ok({ announcement: { ...announcement, pushedTo: 0 } });
    const report = await deps.pusher.send(tokens, pushMessageFor(announcement));
    await deps.announcements.recordPush(announcement.id, now, report.accepted);
    return ok({ announcement: { ...announcement, pushedAt: now, pushedTo: report.accepted } });
  } catch {
    return ok({ announcement, pushFailed: true });
  }
}

/** The notes written so far, newest first. WagonWise staff only. */
export async function listAnnouncements(
  deps: Pick<AnnouncementDeps, 'announcements'>,
  caller: StaffCaller,
): Promise<Result<Announcement[], Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return ok(await deps.announcements.listNewest(LIST_LIMIT));
}

/** Takes a note back, such as one written by mistake. WagonWise staff only. A notification already sent cannot be taken back. */
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

/** Whether this driver gets notifications from WagonWise about what has changed. On unless they have turned them off. */
export async function getPushPreference(
  deps: Pick<AnnouncementDeps, 'preferences'>,
  driverId: string,
): Promise<boolean> {
  return !(await deps.preferences.isOptedOut(driverId));
}

/** A driver turns notifications from WagonWise off or back on. Takes effect for the next one sent. */
export async function setPushPreference(
  deps: Pick<AnnouncementDeps, 'preferences' | 'clock'>,
  driverId: string,
  pushes: boolean,
): Promise<void> {
  await deps.preferences.setOptedOut(driverId, !pushes, deps.clock.now());
}
