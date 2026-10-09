import { makeId } from '../../../shared/brand.js';
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
