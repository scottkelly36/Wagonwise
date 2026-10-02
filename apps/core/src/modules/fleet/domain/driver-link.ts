import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId } from './vehicle.js';

export type DriverLinkId = Id<'DriverLinkId'>;
// fleet owns its own DriverId, same brand name as identity's (decision 46), so a value either side
// produces is usable here via makeId() with no import across the module boundary.
export type DriverId = Id<'DriverId'>;

/**
 * A driver's membership of a company (design doc §3's `FleetDriver`). A driver keeps one identity
 * and can have links to several companies. Two ways in, and the company always has the final say:
 *
 * - the company invites by identifier (phone or email) -> `invited`, the driver accepts;
 * - the driver asks with the company's code -> `requested`, the company approves.
 */
export type DriverLinkStatus = 'invited' | 'requested' | 'active' | 'declined' | 'left';

export interface DriverLink {
  readonly id: DriverLinkId;
  readonly companyId: CompanyId;
  /** Set for a request, and once an invitation is accepted. An invitation is made for an
   *  identifier, not a driver, so the dashboard can't be used to find out who has an account. */
  readonly driverId?: DriverId | undefined;
  /** Set on an invitation; the person who signs in with it sees the invitation. */
  readonly invitedIdentifier?: string | undefined;
  readonly status: DriverLinkStatus;
  readonly createdAt: Date;
  /** When it last moved to a settled status (active, declined or left). */
  readonly decidedAt?: Date | undefined;
}

/** The statuses that count as a live link: one per company and driver (a partial unique index
 *  backs this in the database). Declined and left rows stay as history. */
export const LIVE_STATUSES: readonly DriverLinkStatus[] = ['invited', 'requested', 'active'];

export interface InvalidIdentifier extends TaggedError<'InvalidIdentifier'> {
  readonly reason: 'not_email_or_phone';
}

export interface InvalidLinkTransition extends TaggedError<'InvalidLinkTransition'> {
  readonly from: DriverLinkStatus;
  readonly to: DriverLinkStatus;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{8,15}$/;

/**
 * The same rules as identity's `normalizeIdentifier` (emails lowercased; phone numbers stripped of
 * spaces, hyphens and brackets), declared again here because a module can't import another's
 * domain (AGENTS.md rule 6). They must agree: an invitation is matched to a driver by comparing
 * this value with the one identity stored when they signed up.
 */
export function normalizeIdentifier(raw: string): Result<string, InvalidIdentifier> {
  const trimmed = raw.trim();
  if (EMAIL_RE.test(trimmed)) return ok(trimmed.toLowerCase());
  const digitsOnly = trimmed.replace(/[\s\-()]/g, '');
  if (PHONE_RE.test(digitsOnly)) return ok(digitsOnly);
  return err({ tag: 'InvalidIdentifier', reason: 'not_email_or_phone' });
}

function settle(
  link: DriverLink,
  from: readonly DriverLinkStatus[],
  to: DriverLinkStatus,
  at: Date,
  extra: Partial<DriverLink> = {},
): Result<DriverLink, InvalidLinkTransition> {
  if (!from.includes(link.status)) {
    return err({ tag: 'InvalidLinkTransition', from: link.status, to });
  }
  return ok({ ...link, ...extra, status: to, decidedAt: at });
}

/** The company invites someone by phone or email. */
export function inviteDriver(
  id: DriverLinkId,
  companyId: CompanyId,
  identifier: string,
  at: Date,
): Result<DriverLink, InvalidIdentifier> {
  const normalised = normalizeIdentifier(identifier);
  if (!normalised.ok) return normalised;
  return ok({
    id,
    companyId,
    invitedIdentifier: normalised.value,
    status: 'invited',
    createdAt: at,
  });
}

/** A driver asks to join with the company's code. Nothing is granted until the company approves. */
export function requestToJoin(
  id: DriverLinkId,
  companyId: CompanyId,
  driverId: DriverId,
  at: Date,
): DriverLink {
  return { id, companyId, driverId, status: 'requested', createdAt: at };
}

/** The driver accepts an invitation made to them. */
export function acceptInvitation(
  link: DriverLink,
  driverId: DriverId,
  at: Date,
): Result<DriverLink, InvalidLinkTransition> {
  return settle(link, ['invited'], 'active', at, { driverId });
}

/** The company approves a driver's request. */
export function approveRequest(
  link: DriverLink,
  at: Date,
): Result<DriverLink, InvalidLinkTransition> {
  return settle(link, ['requested'], 'active', at);
}

/** Turns down an invitation or a request, from either side (the driver declining or withdrawing,
 *  the company rejecting or cancelling). */
export function decline(link: DriverLink, at: Date): Result<DriverLink, InvalidLinkTransition> {
  return settle(link, ['invited', 'requested'], 'declined', at);
}

/** Ends an active link: the driver leaving, or the company removing them. */
export function leave(link: DriverLink, at: Date): Result<DriverLink, InvalidLinkTransition> {
  return settle(link, ['active'], 'left', at);
}
