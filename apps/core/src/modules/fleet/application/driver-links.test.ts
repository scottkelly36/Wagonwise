import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { DriverLinkId } from '../domain/driver-link.js';
import { getCompanyCode, regenerateCompanyCode } from './company-code.js';
import type { DriverActor } from './driver-actor.js';
import { inviteDriver } from './invite-driver.js';
import { joinWithCode } from './join-with-code.js';
import { listCompanyDriverLinks, listMyDriverLinks } from './list-driver-links.js';
import type { Caller } from './ports/caller-directory.js';
import { respondToInvitation } from './respond-to-invitation.js';
import {
  approveDriverRequest,
  declineDriverLink,
  leaveFleet,
  removeDriver,
} from './settle-driver-link.js';
import {
  FixedCodeGenerator,
  InMemoryCompanyCodeRepository,
  InMemoryDriverLinkRepository,
} from './testing/in-memory-driver-links.js';

const acme = makeId<'CompanyId'>('acme');
const beta = makeId<'CompanyId'>('beta');
const manager: Caller = { kind: 'fleet', companyId: acme, privileges: ['manage_fleet'] };
const viewer: Caller = { kind: 'fleet', companyId: acme, privileges: [] };
const outsider: Caller = { kind: 'fleet', companyId: beta, privileges: ['manage_fleet'] };
const pat: DriverActor = {
  kind: 'driver',
  driverId: makeId<'DriverId'>('pat'),
  identifier: 'pat@example.com',
};
const sam: DriverActor = {
  kind: 'driver',
  driverId: makeId<'DriverId'>('sam'),
  identifier: 'sam@example.com',
};

function world() {
  const links = new InMemoryDriverLinkRepository();
  const codes = new InMemoryCompanyCodeRepository();
  const ids = new SequentialIdGenerator();
  const clock = new FakeClock('2026-10-02T09:00:00.000Z');
  const generator = new FixedCodeGenerator(['ABCD2345', 'WXYZ6789']);
  return { links, codes, ids, clock, generator, d: { links, codes, ids, clock, generator } };
}

async function activeLink(w: ReturnType<typeof world>): Promise<DriverLinkId> {
  const invite = await inviteDriver(w.d, {
    caller: manager,
    companyId: acme,
    identifier: 'pat@example.com',
  });
  if (!invite.ok) throw new Error('setup');
  await respondToInvitation(w.d, { actor: pat, linkId: invite.value.id, accept: true });
  return invite.value.id;
}

describe('inviting a driver', () => {
  it('normalises the identifier, and needs manage_fleet in that company', async () => {
    const w = world();
    const input = { companyId: acme, identifier: '  Pat@Example.COM ' };
    const ok = await inviteDriver(w.d, { ...input, caller: manager });
    expect(ok.ok && ok.value).toMatchObject({
      status: 'invited',
      invitedIdentifier: 'pat@example.com',
    });
    for (const caller of [viewer, outsider]) {
      expect(await inviteDriver(w.d, { ...input, caller })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });

  it('rejects a bad identifier and a second pending invitation, never saying who has an account', async () => {
    const w = world();
    expect(
      (await inviteDriver(w.d, { caller: manager, companyId: acme, identifier: 'x' })).ok,
    ).toBe(false);
    await inviteDriver(w.d, { caller: manager, companyId: acme, identifier: 'pat@example.com' });
    expect(
      await inviteDriver(w.d, { caller: manager, companyId: acme, identifier: 'PAT@example.com' }),
    ).toEqual({ ok: false, error: { tag: 'AlreadyInvited' } });
  });
});

describe('answering an invitation', () => {
  it('lets the person it was made for accept, becoming active and raising DriverJoinedFleet', async () => {
    const w = world();
    const invite = await inviteDriver(w.d, {
      caller: manager,
      companyId: acme,
      identifier: 'pat@example.com',
    });
    if (!invite.ok) throw new Error('setup');
    const r = await respondToInvitation(w.d, { actor: pat, linkId: invite.value.id, accept: true });
    expect(r.ok && r.value).toMatchObject({ status: 'active', driverId: pat.driverId });
    expect(w.links.events.map((e) => e.eventType)).toEqual(['DriverJoinedFleet']);
  });

  it('can be declined, and is invisible to anyone else', async () => {
    const w = world();
    const invite = await inviteDriver(w.d, {
      caller: manager,
      companyId: acme,
      identifier: 'pat@example.com',
    });
    if (!invite.ok) throw new Error('setup');
    expect(
      await respondToInvitation(w.d, { actor: sam, linkId: invite.value.id, accept: true }),
    ).toEqual({
      ok: false,
      error: { tag: 'LinkNotFound' },
    });
    const declined = await respondToInvitation(w.d, {
      actor: pat,
      linkId: invite.value.id,
      accept: false,
    });
    expect(declined.ok && declined.value.status).toBe('declined');
    expect(w.links.events).toEqual([]);
  });

  it('refuses to accept when they already asked to join that company', async () => {
    const w = world();
    const invite = await inviteDriver(w.d, {
      caller: manager,
      companyId: acme,
      identifier: 'pat@example.com',
    });
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    if (!invite.ok) throw new Error('setup');
    // Their own request, made some other way (the code path blocks this, a race may not).
    await w.links.save({
      id: makeId<'DriverLinkId'>('r1'),
      companyId: acme,
      driverId: pat.driverId,
      status: 'requested',
      createdAt: new Date(),
    });
    expect(
      await respondToInvitation(w.d, { actor: pat, linkId: invite.value.id, accept: true }),
    ).toEqual({
      ok: false,
      error: { tag: 'AlreadyLinked' },
    });
  });
});

describe('joining with a company code', () => {
  it('makes a request the company has to approve, however the code was typed', async () => {
    const w = world();
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    const r = await joinWithCode(w.d, { actor: pat, code: ' abcd-2345 ' });
    expect(r.ok && r.value).toMatchObject({ status: 'requested', companyId: acme });
    expect(w.links.events).toEqual([]);

    const approved = await approveDriverRequest(w.d, {
      caller: manager,
      linkId: r.ok ? r.value.id : ('' as never),
    });
    expect(approved.ok && approved.value.status).toBe('active');
    expect(w.links.events.map((e) => e.eventType)).toEqual(['DriverJoinedFleet']);
  });

  it('gives malformed and unknown codes the same answer', async () => {
    const w = world();
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    for (const code of ['nope', 'ABCD2346', '']) {
      expect(await joinWithCode(w.d, { actor: pat, code })).toEqual({
        ok: false,
        error: { tag: 'InvalidCode' },
      });
    }
  });

  it('refuses a driver who already has a live link or a pending invitation there', async () => {
    const w = world();
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    expect((await joinWithCode(w.d, { actor: pat, code: 'ABCD2345' })).ok).toBe(true);
    expect(await joinWithCode(w.d, { actor: pat, code: 'ABCD2345' })).toEqual({
      ok: false,
      error: { tag: 'AlreadyLinked' },
    });
    await inviteDriver(w.d, { caller: manager, companyId: acme, identifier: 'sam@example.com' });
    expect(await joinWithCode(w.d, { actor: sam, code: 'ABCD2345' })).toEqual({
      ok: false,
      error: { tag: 'AlreadyLinked' },
    });
  });

  it('stops working the moment the code is regenerated', async () => {
    const w = world();
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    const fresh = await regenerateCompanyCode(w.d, { caller: manager, companyId: acme });
    expect(fresh).toEqual({ ok: true, value: 'WXYZ-6789' });
    expect((await joinWithCode(w.d, { actor: pat, code: 'ABCD2345' })).ok).toBe(false);
    expect((await joinWithCode(w.d, { actor: pat, code: 'WXYZ-6789' })).ok).toBe(true);
  });
});

describe("the company's decisions", () => {
  it('only manage_fleet in the same company can approve; another company sees nothing', async () => {
    const w = world();
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    const req = await joinWithCode(w.d, { actor: pat, code: 'ABCD2345' });
    if (!req.ok) throw new Error('setup');
    const linkId = req.value.id;
    expect(await approveDriverRequest(w.d, { caller: viewer, linkId })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await approveDriverRequest(w.d, { caller: outsider, linkId })).toEqual({
      ok: false,
      error: { tag: 'LinkNotFound' },
    });
  });

  it('can reject a request, cancel an invitation, and remove an active driver', async () => {
    const w = world();
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    const req = await joinWithCode(w.d, { actor: pat, code: 'ABCD2345' });
    if (!req.ok) throw new Error('setup');
    const rejected = await declineDriverLink(w.d, { caller: manager, linkId: req.value.id });
    expect(rejected.ok && rejected.value.status).toBe('declined');

    const inv = await inviteDriver(w.d, {
      caller: manager,
      companyId: acme,
      identifier: 'sam@example.com',
    });
    if (!inv.ok) throw new Error('setup');
    expect((await declineDriverLink(w.d, { caller: manager, linkId: inv.value.id })).ok).toBe(true);

    const active = await activeLink(w);
    const removed = await removeDriver(w.d, { caller: manager, linkId: active });
    expect(removed.ok && removed.value.status).toBe('left');
    expect(w.links.events.map((e) => [e.eventType, (e.payload as { by?: string }).by])).toEqual([
      ['DriverJoinedFleet', undefined],
      ['DriverLeftFleet', 'company'],
    ]);
  });
});

describe('a driver leaving', () => {
  it('ends an active link, raising DriverLeftFleet by the driver', async () => {
    const w = world();
    const link = await activeLink(w);
    const r = await leaveFleet(w.d, { actor: pat, linkId: link });
    expect(r.ok && r.value.status).toBe('left');
    expect(w.links.events.at(-1)).toMatchObject({
      eventType: 'DriverLeftFleet',
      payload: { by: 'driver' },
    });
  });

  it('withdraws a request without an event, and cannot touch another driver’s link', async () => {
    const w = world();
    await getCompanyCode(w.d, { caller: manager, companyId: acme });
    const req = await joinWithCode(w.d, { actor: pat, code: 'ABCD2345' });
    if (!req.ok) throw new Error('setup');
    expect(await leaveFleet(w.d, { actor: sam, linkId: req.value.id })).toEqual({
      ok: false,
      error: { tag: 'LinkNotFound' },
    });
    const r = await leaveFleet(w.d, { actor: pat, linkId: req.value.id });
    expect(r.ok && r.value.status).toBe('declined');
    expect(w.links.events).toEqual([]);
  });
});

describe('listing and the code', () => {
  it('lists a company’s links for its own staff only, and a driver’s own plus invitations for them', async () => {
    const w = world();
    await inviteDriver(w.d, { caller: manager, companyId: acme, identifier: 'pat@example.com' });
    expect((await listCompanyDriverLinks(w.d, { caller: viewer, companyId: acme })).ok).toBe(true);
    expect(await listCompanyDriverLinks(w.d, { caller: outsider, companyId: acme })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await listMyDriverLinks(w.d, { actor: pat })).toHaveLength(1);
    expect(await listMyDriverLinks(w.d, { actor: sam })).toHaveLength(0);
  });

  it('makes the code once, shows it formatted, and keeps it until regenerated', async () => {
    const w = world();
    expect(await getCompanyCode(w.d, { caller: viewer, companyId: acme })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await getCompanyCode(w.d, { caller: manager, companyId: acme })).toEqual({
      ok: true,
      value: 'ABCD-2345',
    });
    expect(await getCompanyCode(w.d, { caller: manager, companyId: acme })).toEqual({
      ok: true,
      value: 'ABCD-2345',
    });
  });
});
