import { checkEmail } from '@wagonwise/contracts/email-check';

import { makeId } from '../../../shared/brand.js';
import { INVITE_SUBJECT, inviteEmail } from '../domain/invite-email.js';
import { ownerAlert, REGISTRANT_SUBJECT, registrantReply } from '../domain/registration-emails.js';
import { LAUNCH_SUBJECT, launchEmailHtml, launchEmailText } from '../domain/launch-email.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  DAILY_CAP,
  normaliseEmail,
  validateSignup,
  type InvalidSignup,
  type Tester,
  type TesterId,
} from '../domain/signup.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type TooManySignups = TaggedError<'TooManySignups'>;
export type NotFound = TaggedError<'NotFound'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

export interface TesterRepository {
  /** Adds the tester unless the address is already held; says whether it was new. */
  insertIfNew(tester: Tester): Promise<boolean>;
  countSince(since: Date): Promise<number>;
  /** Newest first. */
  list(limit: number): Promise<Tester[]>;
  count(): Promise<number>;
  findByIds(ids: readonly TesterId[]): Promise<Tester[]>;
  markInvited(id: TesterId, inviteCode: string, at: Date): Promise<void>;
  markLaunchEmailed(id: TesterId, at: Date): Promise<void>;
  markTrialStarted(id: TesterId, companyId: string, at: Date): Promise<void>;
  delete(id: TesterId): Promise<boolean>;
  deleteByEmail(email: string): Promise<void>;
}

/**
 * Supplied by composition: a line to the owner, and an email to the person who registered. Sending is never allowed to fail or slow a
 * registration, so nothing waits on these.
 */
export interface SignupNotifier {
  /** To the owner's alert address; nothing happens when none is set. */
  toOwner(subject: string, text: string): Promise<void>;
  toRegistrant(to: string, subject: string, text: string): Promise<void>;
  /** The portal's address, for the owner's "start a trial" link. */
  readonly portalAddress?: string | undefined;
}

export interface SignupDeps {
  readonly testers: TesterRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly notify?: SignupNotifier | undefined;
}

/** The first moment of the current UTC day. */
const startOfDay = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * Registers an address to test WagonWise. The person must have agreed to be contacted. Sending an address that is already
 * held succeeds and changes nothing, so the answer never says who is on the list. A day's registrations are capped, so a bot
 * cannot fill the table.
 */
export async function signUp(
  deps: SignupDeps,
  input: {
    readonly email: string;
    readonly name?: string | undefined;
    readonly role: string;
    readonly company?: string | undefined;
    readonly fleetSize?: string | undefined;
    readonly consent: boolean;
  },
): Promise<Result<void, InvalidSignup | TooManySignups>> {
  const checked = validateSignup(input);
  if (!checked.ok) return checked;
  // An ending that does not exist (sam@gmail.comg) can only bounce: the page asks about likelier slips, this is the one that stands.
  if (checkEmail(checked.value.email).kind === 'impossible') {
    return err({ tag: 'InvalidSignup', reason: 'email' });
  }
  const now = deps.clock.now();
  if ((await deps.testers.countSince(startOfDay(now))) >= DAILY_CAP) {
    return err({ tag: 'TooManySignups' });
  }
  const isNew = await deps.testers.insertIfNew({
    id: makeId<'TesterId'>(deps.ids.newId()),
    ...checked.value,
    consentedAt: now,
    createdAt: now,
  });
  // A firm (not a driver) that was not already on the list: tell the owner, and thank them. Fired and forgotten, so a failed or slow
  // email never changes the answer, and a repeated address, which was already thanked, is not written to again.
  if (isNew && deps.notify !== undefined && checked.value.role !== 'driver') {
    const alert = ownerAlert(checked.value, deps.notify.portalAddress);
    void Promise.allSettled([
      deps.notify.toOwner(alert.subject, alert.text),
      deps.notify.toRegistrant(
        checked.value.email,
        REGISTRANT_SUBJECT,
        registrantReply(checked.value),
      ),
    ]);
  }
  return ok(undefined);
}

/** Takes an address off the list. Always the same answer, whether or not it was there. */
export async function removeMe(deps: Pick<SignupDeps, 'testers'>, email: string): Promise<void> {
  await deps.testers.deleteByEmail(normaliseEmail(email));
}

/** Everyone registered, newest first. WagonWise staff only. */
export async function listTesters(
  deps: Pick<SignupDeps, 'testers'>,
  caller: StaffCaller,
): Promise<Result<{ testers: Tester[]; total: number }, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const [testers, total] = await Promise.all([deps.testers.list(2000), deps.testers.count()]);
  return ok({ testers, total });
}

/** Removes one person. WagonWise staff only. */
export async function deleteTester(
  deps: Pick<SignupDeps, 'testers'>,
  caller: StaffCaller,
  id: TesterId,
): Promise<Result<void, Forbidden | NotFound>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return (await deps.testers.delete(id)) ? ok(undefined) : err({ tag: 'NotFound' });
}

/** The most people one send-invites call takes: a guard against a slip, and keeps the request quick. */
export const MAX_INVITES_PER_SEND = 50;

/** Supplied by composition over `identity`: a fresh invite code nobody has used, and the sender that carries sign-in codes. */
export interface InvitePorts {
  newInviteCode(): Promise<string>;
  sendEmail(to: string, subject: string, text: string, html?: string): Promise<void>;
}

export type InviteStatus = 'sent' | 'already_invited' | 'not_found' | 'failed';

/**
 * Sends the standard invite email to each chosen tester, with an invite code made for them alone, and records who was
 * sent it and when. Someone already invited is skipped (never a second code), and one failed email does not stop the
 * rest. The tester is marked only after the email has gone, so a failure can simply be tried again. WagonWise staff only.
 */
export async function sendInvites(
  deps: Pick<SignupDeps, 'testers' | 'clock'> & { readonly invites: InvitePorts },
  caller: StaffCaller,
  input: { readonly ids: readonly TesterId[]; readonly optInLink: string },
): Promise<Result<{ id: TesterId; status: InviteStatus }[], Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const ids = [...new Set(input.ids)].slice(0, MAX_INVITES_PER_SEND);
  const found = new Map((await deps.testers.findByIds(ids)).map((t) => [t.id, t]));
  const results: { id: TesterId; status: InviteStatus }[] = [];
  for (const id of ids) {
    const tester = found.get(id);
    if (tester === undefined) {
      results.push({ id, status: 'not_found' });
      continue;
    }
    if (tester.invitedAt !== undefined) {
      results.push({ id, status: 'already_invited' });
      continue;
    }
    try {
      const inviteCode = await deps.invites.newInviteCode();
      await deps.invites.sendEmail(
        tester.email,
        INVITE_SUBJECT,
        inviteEmail({
          name: tester.name,
          email: tester.email,
          inviteCode,
          optInLink: input.optInLink,
        }),
      );
      await deps.testers.markInvited(id, inviteCode, deps.clock.now());
      results.push({ id, status: 'sent' });
    } catch {
      results.push({ id, status: 'failed' });
    }
  }
  return ok(results);
}

export type LaunchEmailStatus = 'sent' | 'already_sent' | 'not_found' | 'failed';

/**
 * Sends the "WagonWise is out now" email, with the App Store and Google Play links, to each chosen tester and records who was
 * sent it and when. Anyone sent it already is skipped (never a second one), and one failed email does not stop the rest. The
 * tester is marked only after the email has gone, so a failure can simply be tried again. Unlike the invite it makes no invite
 * code: the app is public now. WagonWise staff only.
 */
export async function sendLaunchEmails(
  deps: Pick<SignupDeps, 'testers' | 'clock'> & { readonly invites: InvitePorts },
  caller: StaffCaller,
  input: {
    readonly ids: readonly TesterId[];
    readonly appStoreLink: string;
    readonly playStoreLink: string;
  },
): Promise<Result<{ id: TesterId; status: LaunchEmailStatus }[], Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const ids = [...new Set(input.ids)].slice(0, MAX_INVITES_PER_SEND);
  const found = new Map((await deps.testers.findByIds(ids)).map((t) => [t.id, t]));
  const results: { id: TesterId; status: LaunchEmailStatus }[] = [];
  for (const id of ids) {
    const tester = found.get(id);
    if (tester === undefined) {
      results.push({ id, status: 'not_found' });
      continue;
    }
    if (tester.launchEmailedAt !== undefined) {
      results.push({ id, status: 'already_sent' });
      continue;
    }
    try {
      const email = {
        name: tester.name,
        appStoreLink: input.appStoreLink,
        playStoreLink: input.playStoreLink,
      };
      await deps.invites.sendEmail(
        tester.email,
        LAUNCH_SUBJECT,
        launchEmailText(email),
        launchEmailHtml(email),
      );
      await deps.testers.markLaunchEmailed(id, deps.clock.now());
      results.push({ id, status: 'sent' });
    } catch {
      results.push({ id, status: 'failed' });
    }
  }
  return ok(results);
}

/** Supplied by composition over `companies`: makes a company on a free trial and invites its first admin. Opens its own data scope. */
export interface FirmStarter {
  startTrialFirm(input: {
    readonly staffId: string;
    readonly firmName: string;
    readonly contactName: string;
    readonly contactEmail: string;
  }): Promise<
    Result<
      {
        readonly companyId: string;
        readonly emailed: boolean;
        readonly inviteToken: string;
        /** How many vehicles the new company's plan covers (0 when none could be set: raise it on the Plans page). */
        readonly vehicles: number;
      },
      Forbidden | TaggedError<'EmailAlreadyInUse'>
    >
  >;
}

export type StartTrialOutcome =
  | {
      readonly status: 'started';
      readonly companyId: string;
      readonly vehicles: number;
      /** Whether the email with the join link went. When it did not, `inviteToken` is given so the owner can send the link. */
      readonly emailed: boolean;
      readonly inviteToken?: string | undefined;
    }
  | { readonly status: 'already_started' | 'not_found' | 'not_a_firm' | 'email_in_use' };

/**
 * One button on a firm that registered on the website: makes the company on a free trial (the length in the owner's settings) and
 * emails its first admin the link to join, then notes on the sign-up that this was done so it cannot be done twice. WagonWise staff
 * only. A driver's sign-up is not a firm. `scoped` runs the reads and the note in WagonWise's data scope; the firm itself is made
 * outside it, because `companies` opens its own scope and scopes cannot nest. If noting it fails after the firm is made, the firm
 * still exists and the sign-up shows no trial: pressing again is refused because the address is already a user, so nothing doubles.
 */
export async function startTrial(
  deps: Pick<SignupDeps, 'testers' | 'clock'> & { readonly firms: FirmStarter },
  caller: StaffCaller,
  input: {
    readonly id: TesterId;
    readonly staffId: string;
    readonly firmName: string;
    readonly contactName?: string | undefined;
  },
  scoped: <T>(work: () => Promise<T>) => Promise<T>,
): Promise<Result<StartTrialOutcome, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const tester = (await scoped(() => deps.testers.findByIds([input.id])))[0];
  if (tester === undefined) return ok({ status: 'not_found' });
  if (tester.trialStartedAt !== undefined) return ok({ status: 'already_started' });
  if (tester.role === 'driver') return ok({ status: 'not_a_firm' });
  const made = await deps.firms.startTrialFirm({
    staffId: input.staffId,
    firmName: input.firmName.trim(),
    contactName: (input.contactName ?? tester.name ?? '').trim() || 'there',
    contactEmail: tester.email,
  });
  if (!made.ok) {
    return made.error.tag === 'Forbidden' ? err(made.error) : ok({ status: 'email_in_use' });
  }
  await scoped(() =>
    deps.testers.markTrialStarted(tester.id, made.value.companyId, deps.clock.now()),
  );
  return ok({
    status: 'started',
    companyId: made.value.companyId,
    vehicles: made.value.vehicles,
    emailed: made.value.emailed,
    ...(made.value.emailed ? {} : { inviteToken: made.value.inviteToken }),
  });
}
