import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { firmKey, makeCode, staffMayMove, type Referral } from '../domain/referral.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type NotFound = TaggedError<'NotFound'>;
/** The firm already has a referral that counts: one reward per firm. */
export type AlreadyReferred = TaggedError<'AlreadyReferred'>;
/** The move is not allowed from where the referral is now. */
export type WrongStatus = TaggedError<'WrongStatus'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

/** A driver's name, or the sign-in the office sees. Supplied by composition over identity. */
export interface DriverLabels {
  label(driverId: string): Promise<string | null>;
}

export interface ReferralCodeRepository {
  findByDriver(driverId: string): Promise<string | null>;
  findDriver(code: string): Promise<string | null>;
  /** False when the code is already taken (a clash, tried again with another). */
  insert(driverId: string, code: string, at: Date): Promise<boolean>;
  eraseDriver(driverId: string): Promise<void>;
}

export interface ReferralRepository {
  insert(referral: Referral, firmKey: string): Promise<boolean>;
  find(id: string): Promise<Referral | null>;
  listForDriver(driverId: string): Promise<Referral[]>;
  listAll(): Promise<Referral[]>;
  update(referral: Referral): Promise<void>;
  eraseDriver(driverId: string): Promise<void>;
}

export interface ReferralDeps {
  readonly codes: ReferralCodeRepository;
  readonly referrals: ReferralRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly random: () => number;
}

const forbidden = (caller: StaffCaller): Forbidden | null =>
  caller.kind === 'platform' ? null : { tag: 'Forbidden' };

/** The driver's code, made the first time they ask. A clash with another driver's code is tried again. */
export async function codeFor(deps: ReferralDeps, driverId: string): Promise<string> {
  const existing = await deps.codes.findByDriver(driverId);
  if (existing !== null) return existing;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeCode(deps.random);
    if (await deps.codes.insert(driverId, code, deps.clock.now())) return code;
    // Another request may have made this driver's code meanwhile.
    const raced = await deps.codes.findByDriver(driverId);
    if (raced !== null) return raced;
  }
  throw new Error('Could not make a referral code');
}

export async function myReferrals(
  deps: ReferralDeps,
  driverId: string,
): Promise<{ readonly code: string; readonly referrals: Referral[] }> {
  const code = await codeFor(deps, driverId);
  return { code, referrals: await deps.referrals.listForDriver(driverId) };
}

/** The driver says where to send a gift card that is due. Only their own, and only once it is due. */
export async function claimReward(
  deps: ReferralDeps,
  driverId: string,
  id: string,
  email: string,
): Promise<Result<Referral, NotFound | WrongStatus>> {
  const found = await deps.referrals.find(id);
  if (found === null || found.driverId !== driverId) return err({ tag: 'NotFound' });
  if (found.status !== 'reward_due') return err({ tag: 'WrongStatus' });
  const claimed: Referral = {
    ...found,
    status: 'claimed',
    rewardEmail: email.trim(),
    updatedAt: deps.clock.now(),
  };
  await deps.referrals.update(claimed);
  return ok(claimed);
}

export async function listReferrals(
  deps: ReferralDeps,
  caller: StaffCaller,
): Promise<Result<Referral[], Forbidden>> {
  const no = forbidden(caller);
  if (no !== null) return err(no);
  return ok(await deps.referrals.listAll());
}

export async function lookupCode(
  deps: ReferralDeps,
  caller: StaffCaller,
  code: string,
): Promise<Result<string, Forbidden | NotFound>> {
  const no = forbidden(caller);
  if (no !== null) return err(no);
  const driverId = await deps.codes.findDriver(code);
  return driverId === null ? err({ tag: 'NotFound' }) : ok(driverId);
}

/** A firm has joined and named a driver's code. One referral per firm that counts. */
export async function recordReferral(
  deps: ReferralDeps,
  caller: StaffCaller,
  input: { readonly code: string; readonly firmName: string },
): Promise<Result<Referral, Forbidden | NotFound | AlreadyReferred>> {
  const no = forbidden(caller);
  if (no !== null) return err(no);
  const driverId = await deps.codes.findDriver(input.code);
  if (driverId === null) return err({ tag: 'NotFound' });
  const now = deps.clock.now();
  const referral: Referral = {
    id: deps.ids.newId(),
    code: input.code,
    driverId,
    firmName: input.firmName.trim(),
    status: 'signed_up',
    rewardEmail: null,
    createdAt: now,
    updatedAt: now,
  };
  if (!(await deps.referrals.insert(referral, firmKey(referral.firmName))))
    return err({ tag: 'AlreadyReferred' });
  return ok(referral);
}

export async function setReferralStatus(
  deps: ReferralDeps,
  caller: StaffCaller,
  id: string,
  status: 'reward_due' | 'sent' | 'void',
): Promise<Result<Referral, Forbidden | NotFound | WrongStatus>> {
  const no = forbidden(caller);
  if (no !== null) return err(no);
  const found = await deps.referrals.find(id);
  if (found === null) return err({ tag: 'NotFound' });
  if (!staffMayMove(found.status, status)) return err({ tag: 'WrongStatus' });
  const moved: Referral = { ...found, status, updatedAt: deps.clock.now() };
  await deps.referrals.update(moved);
  return ok(moved);
}

/** For account deletion: the code and the driver's referrals, with any email given for a reward. Safe to run twice. */
export async function eraseDriverReferrals(deps: ReferralDeps, driverId: string): Promise<void> {
  await deps.referrals.eraseDriver(driverId);
  await deps.codes.eraseDriver(driverId);
}
