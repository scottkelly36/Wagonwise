import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  acceptInvitation,
  approveRequest,
  decline,
  inviteDriver,
  leave,
  normalizeIdentifier,
  requestToJoin,
  type DriverLink,
} from './driver-link.js';

const t = (n: number) => new Date(Date.UTC(2026, 9, 2, n));
const id = makeId<'DriverLinkId'>('link-1');
const company = makeId<'CompanyId'>('company-1');
const driver = makeId<'DriverId'>('driver-1');

const invited = (): DriverLink => {
  const r = inviteDriver(id, company, '  Pat@Example.COM ', t(0));
  if (!r.ok) throw new Error('setup');
  return r.value;
};

describe('normalizeIdentifier', () => {
  it('lowercases emails and strips phone formatting, like identity does', () => {
    expect(normalizeIdentifier(' Pat@Example.COM ')).toEqual({
      ok: true,
      value: 'pat@example.com',
    });
    expect(normalizeIdentifier('+44 (7123) 456-789')).toEqual({ ok: true, value: '+447123456789' });
  });

  it('rejects anything that is neither', () => {
    expect(normalizeIdentifier('hello')).toEqual({
      ok: false,
      error: { tag: 'InvalidIdentifier', reason: 'not_email_or_phone' },
    });
  });
});

describe('invitation path', () => {
  it('is made for an identifier, not a driver, and accepted by the driver who has it', () => {
    const link = invited();
    expect(link).toMatchObject({ status: 'invited', invitedIdentifier: 'pat@example.com' });
    expect(link.driverId).toBeUndefined();
    const accepted = acceptInvitation(link, driver, t(1));
    expect(accepted.ok && accepted.value).toMatchObject({
      status: 'active',
      driverId: driver,
      decidedAt: t(1),
    });
  });

  it('can be declined, but not accepted afterwards', () => {
    const declined = decline(invited(), t(1));
    expect(declined.ok && declined.value.status).toBe('declined');
    expect(declined.ok && acceptInvitation(declined.value, driver, t(2)).ok).toBe(false);
  });

  it('rejects a bad identifier when inviting', () => {
    expect(inviteDriver(id, company, 'nope', t(0)).ok).toBe(false);
  });
});

describe('request path', () => {
  it('is waiting until the company approves', () => {
    const link = requestToJoin(id, company, driver, t(0));
    expect(link).toMatchObject({ status: 'requested', driverId: driver });
    const approved = approveRequest(link, t(1));
    expect(approved.ok && approved.value).toMatchObject({ status: 'active', decidedAt: t(1) });
  });

  it('can be rejected or withdrawn, and an invitation cannot be approved as a request', () => {
    expect(decline(requestToJoin(id, company, driver, t(0)), t(1)).ok).toBe(true);
    expect(approveRequest(invited(), t(1))).toEqual({
      ok: false,
      error: { tag: 'InvalidLinkTransition', from: 'invited', to: 'active' },
    });
  });
});

describe('leave', () => {
  it('ends an active link only', () => {
    const active = approveRequest(requestToJoin(id, company, driver, t(0)), t(1));
    if (!active.ok) throw new Error('setup');
    const left = leave(active.value, t(2));
    expect(left.ok && left.value).toMatchObject({ status: 'left', decidedAt: t(2) });
    expect(leave(invited(), t(2)).ok).toBe(false);
    expect(left.ok && leave(left.value, t(3)).ok).toBe(false);
  });
});
