import { makeId } from '../../../shared/brand.js';
import { INVITE_SUBJECT, inviteEmail } from '../domain/invite-email.js';
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
  delete(id: TesterId): Promise<boolean>;
  deleteByEmail(email: string): Promise<void>;
}

export interface SignupDeps {
  readonly testers: TesterRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
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
  const now = deps.clock.now();
  if ((await deps.testers.countSince(startOfDay(now))) >= DAILY_CAP) {
    return err({ tag: 'TooManySignups' });
  }
  await deps.testers.insertIfNew({
    id: makeId<'TesterId'>(deps.ids.newId()),
    ...checked.value,
    consentedAt: now,
    createdAt: now,
  });
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
  sendEmail(to: string, subject: string, text: string): Promise<void>;
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
