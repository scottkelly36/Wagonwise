import { isDisposableEmail } from '@wagonwise/contracts/disposable-email';
import { checkEmail } from '@wagonwise/contracts/email-check';

import { makeId } from '../../../shared/brand.js';
import { INVITE_SUBJECT, inviteEmail } from '../domain/invite-email.js';
import {
  ownerAlert,
  REGISTRANT_SUBJECT,
  registrantReply,
  trialStartedAlert,
  trialWaitingAlert,
  type WaitingReason,
} from '../domain/registration-emails.js';
import {
  AUTO_TRIAL_DAILY_CAP,
  emailDomain,
  isFreeMail,
  LINK_RESEND_AFTER_MS,
  TRIAL_LINK_LIFETIME_MS,
} from '../domain/trial-link.js';
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
  findByEmail(email: string): Promise<Tester | null>;
  /** Keeps the hash of a new trial link and when it stops working, replacing any earlier one. */
  setTrialLink(id: TesterId, tokenHash: string, expiresAt: Date): Promise<void>;
  findByTrialLink(tokenHash: string): Promise<Tester | null>;
  /** Trials started (by anyone, a button or a link) since a time, and how many from one email domain, ever. */
  countTrialsStartedSince(since: Date): Promise<number>;
  countTrialsStartedFromDomain(domain: string): Promise<number>;
  /**
   * Takes the right to start this sign-up's trial: true for the one caller that gets it, false for any other (a second press, the same
   * link opened twice). Without it two quick presses could each make a firm, because an invitation is not yet an account.
   */
  claimTrial(id: TesterId, at: Date): Promise<boolean>;
  /** Gives the claim back when the firm could not be made. */
  releaseTrial(id: TesterId): Promise<void>;
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
  /** Makes and checks the secret in a trial link. Without it no link is made and a firm waits for the owner, as before. */
  readonly tokens?: TrialTokens | undefined;
}

export interface TrialTokens {
  /** A new random secret, for the link. */
  generate(): string;
  /** What is kept of it: the secret itself is never stored. */
  hash(token: string): string;
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
  if (
    checkEmail(checked.value.email).kind === 'impossible' ||
    isDisposableEmail(checked.value.email)
  ) {
    return err({ tag: 'InvalidSignup', reason: 'email' });
  }
  const now = deps.clock.now();
  if ((await deps.testers.countSince(startOfDay(now))) >= DAILY_CAP) {
    return err({ tag: 'TooManySignups' });
  }
  const id = makeId<'TesterId'>(deps.ids.newId());
  const isNew = await deps.testers.insertIfNew({
    id,
    ...checked.value,
    consentedAt: now,
    createdAt: now,
  });
  if (deps.notify === undefined || checked.value.role === 'driver') return ok(undefined);
  // A firm (not a driver) that was not already on the list: tell the owner, and send them the link that starts their own trial (or, with no
  // link, thank them). Fired and forgotten, so a failed or slow email never changes the answer.
  if (isNew) {
    const link = await issueTrialLink(deps, id, now);
    const alert = ownerAlert(checked.value, deps.notify.portalAddress, link !== undefined);
    void Promise.allSettled([
      deps.notify.toOwner(alert.subject, alert.text),
      deps.notify.toRegistrant(
        checked.value.email,
        REGISTRANT_SUBJECT,
        registrantReply(checked.value, link),
      ),
    ]);
    return ok(undefined);
  }
  // Seen before. A firm that has not started its trial and whose last link is more than an hour old gets a fresh one, so a lost email is not
  // the end of it, and the form cannot be used to flood an inbox. The answer is the same either way: it never says who is on the list.
  const existing = await deps.testers.findByEmail(checked.value.email);
  if (existing !== null && existing.role !== 'driver' && existing.trialStartedAt === undefined) {
    const issuedAt =
      existing.trialLinkExpiresAt === undefined
        ? undefined
        : existing.trialLinkExpiresAt.getTime() - TRIAL_LINK_LIFETIME_MS;
    if (issuedAt === undefined || now.getTime() - issuedAt >= LINK_RESEND_AFTER_MS) {
      const link = await issueTrialLink(deps, existing.id, now);
      if (link !== undefined) {
        void Promise.allSettled([
          deps.notify.toRegistrant(
            existing.email,
            REGISTRANT_SUBJECT,
            registrantReply(existing, link),
          ),
        ]);
      }
    }
  }
  return ok(undefined);
}

/**
 * A new link that lets this sign-up start its own trial, kept as a hash, and the address to put in the email. Nothing when there is no
 * portal address to point at or nothing to make a secret with: the firm then waits for the owner, as it did before links.
 */
async function issueTrialLink(
  deps: Pick<SignupDeps, 'testers' | 'tokens' | 'notify'>,
  id: TesterId,
  now: Date,
): Promise<string | undefined> {
  const portal = deps.notify?.portalAddress;
  if (deps.tokens === undefined || portal === undefined) return undefined;
  const token = deps.tokens.generate();
  await deps.testers.setTrialLink(
    id,
    deps.tokens.hash(token),
    new Date(now.getTime() + TRIAL_LINK_LIFETIME_MS),
  );
  return `${portal.replace(/\/+$/, '')}/start-trial?token=${encodeURIComponent(token)}`;
}

/** The sign-up a link belongs to, when the link is real, has not expired and is for a firm; otherwise null (the answer never says which). */
async function testerForLink(
  deps: Pick<SignupDeps, 'testers' | 'clock' | 'tokens'>,
  token: string,
): Promise<Tester | null> {
  if (deps.tokens === undefined) return null;
  const tester = await deps.testers.findByTrialLink(deps.tokens.hash(token));
  if (tester === null || tester.role === 'driver') return null;
  if (tester.trialLinkExpiresAt === undefined || tester.trialLinkExpiresAt <= deps.clock.now()) {
    return null;
  }
  return tester;
}

export type TrialPreview =
  | { readonly valid: false }
  | {
      readonly valid: true;
      readonly started: boolean;
      /** The registration had no firm name, so the page asks for one. */
      readonly needsCompany: boolean;
      readonly email: string;
      readonly company?: string | undefined;
    };

/** What a link is for, before the firm presses the button: the page shows the address and asks for a firm name when there is none. */
export async function previewTrial(
  deps: Pick<SignupDeps, 'testers' | 'clock' | 'tokens'>,
  token: string,
): Promise<TrialPreview> {
  const tester = await testerForLink(deps, token);
  if (tester === null) return { valid: false };
  return {
    valid: true,
    started: tester.trialStartedAt !== undefined,
    needsCompany: tester.company === undefined,
    email: tester.email,
    ...(tester.company === undefined ? {} : { company: tester.company }),
  };
}

export type ConfirmTrialOutcome =
  | { readonly status: 'started'; readonly vehicles: number }
  | {
      readonly status: 'waiting' | 'already_started' | 'invalid' | 'needs_company' | 'email_in_use';
    };

/**
 * The firm presses "Start my trial" on the page its emailed link opens. The link is the proof that the address is theirs, so no one at
 * WagonWise presses a button: the company is made on a free trial and its first person invited, as the Testers page's button does. Two
 * limits keep a bot from making a pile of trials, and past either the firm is not turned away: it waits for the owner, who is told. A
 * day's automatic trials are capped, and a business email domain gets one (free-mail domains are limited by address, which a sign-up
 * already is). `scoped` runs the reads and notes in WagonWise's data scope; the firm itself is made outside it, because `companies`
 * opens its own scope and scopes cannot nest.
 */
export async function confirmTrial(
  deps: Pick<SignupDeps, 'testers' | 'clock' | 'tokens' | 'notify'> & {
    readonly firms: FirmStarter;
  },
  input: { readonly token: string; readonly company?: string | undefined },
  scoped: <T>(work: () => Promise<T>) => Promise<T>,
): Promise<ConfirmTrialOutcome> {
  const tester = await scoped(() => testerForLink(deps, input.token));
  if (tester === null) return { status: 'invalid' };
  if (tester.trialStartedAt !== undefined) return { status: 'already_started' };
  const firmName = (input.company?.trim() || tester.company?.trim() || '').slice(0, 120);
  if (firmName === '') return { status: 'needs_company' };

  const now = deps.clock.now();
  const held = await scoped(async (): Promise<WaitingReason | undefined> => {
    if ((await deps.testers.countTrialsStartedSince(startOfDay(now))) >= AUTO_TRIAL_DAILY_CAP) {
      return 'daily_limit';
    }
    if (
      !isFreeMail(tester.email) &&
      (await deps.testers.countTrialsStartedFromDomain(emailDomain(tester.email))) > 0
    ) {
      return 'same_domain';
    }
    return undefined;
  });
  if (held !== undefined) {
    if (deps.notify !== undefined) {
      const alert = trialWaitingAlert({
        email: tester.email,
        firm: firmName,
        reason: held,
        portalAddress: deps.notify.portalAddress,
      });
      void Promise.allSettled([deps.notify.toOwner(alert.subject, alert.text)]);
    }
    return { status: 'waiting' };
  }

  // Take the right to start it before making anything: a second press, or the link opened twice, gets "already started" and makes nothing.
  if (!(await scoped(() => deps.testers.claimTrial(tester.id, now)))) {
    return { status: 'already_started' };
  }
  const made = await deps.firms.startSelfServeTrialFirm({
    firmName,
    contactName: (tester.name ?? '').trim() || 'there',
    contactEmail: tester.email,
  });
  if (!made.ok) {
    await scoped(() => deps.testers.releaseTrial(tester.id));
    return { status: 'email_in_use' };
  }
  await scoped(() => deps.testers.markTrialStarted(tester.id, made.value.companyId, now));
  if (deps.notify !== undefined) {
    const alert = trialStartedAlert({
      email: tester.email,
      firm: firmName,
      vehicles: made.value.vehicles,
    });
    void Promise.allSettled([deps.notify.toOwner(alert.subject, alert.text)]);
  }
  return { status: 'started', vehicles: made.value.vehicles };
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
  /** The same, for a firm that confirmed its own email address: no WagonWise staff member is involved. */
  startSelfServeTrialFirm(input: {
    readonly firmName: string;
    readonly contactName: string;
    readonly contactEmail: string;
  }): Promise<
    Result<
      {
        readonly companyId: string;
        readonly emailed: boolean;
        readonly inviteToken: string;
        readonly vehicles: number;
      },
      TaggedError<'EmailAlreadyInUse'>
    >
  >;
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
