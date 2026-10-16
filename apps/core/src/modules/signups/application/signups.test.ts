import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import {
  DAILY_CAP,
  looksLikeEmail,
  normaliseEmail,
  type Tester,
  type TesterId,
} from '../domain/signup.js';
import {
  deleteTester,
  listTesters,
  MAX_INVITES_PER_SEND,
  sendInvites,
  type InvitePorts,
  removeMe,
  signUp,
  type SignupDeps,
  type StaffCaller,
  type TesterRepository,
} from './signups.js';

class InMemoryTesters implements TesterRepository {
  readonly rows = new Map<string, Tester>();

  insertIfNew(t: Tester): Promise<boolean> {
    if ([...this.rows.values()].some((x) => x.email === t.email)) return Promise.resolve(false);
    this.rows.set(t.id, t);
    return Promise.resolve(true);
  }

  countSince(since: Date): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((t) => t.createdAt >= since).length);
  }

  list(limit: number): Promise<Tester[]> {
    return Promise.resolve([...this.rows.values()].slice(0, limit));
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  findByIds(ids: readonly TesterId[]): Promise<Tester[]> {
    return Promise.resolve(ids.flatMap((id) => this.rows.get(id) ?? []));
  }

  markInvited(id: TesterId, inviteCode: string, at: Date): Promise<void> {
    const t = this.rows.get(id);
    if (t !== undefined) this.rows.set(id, { ...t, invitedAt: at, inviteCode });
    return Promise.resolve();
  }

  delete(id: TesterId): Promise<boolean> {
    return Promise.resolve(this.rows.delete(id));
  }

  deleteByEmail(email: string): Promise<void> {
    for (const [id, t] of this.rows) if (t.email === email) this.rows.delete(id);
    return Promise.resolve();
  }
}

const platform: StaffCaller = { kind: 'platform' };
const fleet: StaffCaller = {
  kind: 'fleet',
  companyId: 'c',
  privileges: ['manage_billing', 'manage_fleet'],
};

function setup() {
  const testers = new InMemoryTesters();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: SignupDeps = { testers, ids: new SequentialIdGenerator(), clock };
  return { deps, testers, clock };
}

const good = { email: 'sam@example.com', role: 'driver', consent: true };

describe('the email', () => {
  it('is tidied, and junk and typos are turned away', () => {
    expect(normaliseEmail('  Sam@Example.COM ')).toBe('sam@example.com');
    for (const ok of ['a@b.co', 'sam.carter+test@acme-haulage.co.uk'])
      expect(looksLikeEmail(ok)).toBe(true);
    for (const bad of [
      '',
      'sam',
      'sam@',
      '@x.com',
      'sam@x',
      'sam @x.com',
      'a..b@x.com',
      `${'a'.repeat(250)}@x.com`,
    ]) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });
});

describe('signUp', () => {
  it('registers someone who agreed, with their words tidied, and keeps when they agreed', async () => {
    const { deps, testers, clock } = setup();
    const result = await signUp(deps, {
      email: ' Sam@Example.com ',
      name: '  Sam Carter ',
      role: 'both',
      company: ' Carter Haulage ',
      fleetSize: '6-15',
      consent: true,
    });
    expect(result.ok).toBe(true);
    expect([...testers.rows.values()][0]).toMatchObject({
      email: 'sam@example.com',
      name: 'Sam Carter',
      role: 'both',
      company: 'Carter Haulage',
      fleetSize: '6-15',
      consentedAt: clock.now(),
    });
  });

  it('takes just an email and a role, and treats blanks as nothing', async () => {
    const { deps, testers } = setup();
    expect((await signUp(deps, { ...good, name: '  ', company: '', fleetSize: '' })).ok).toBe(true);
    expect([...testers.rows.values()][0]).toMatchObject({
      name: undefined,
      company: undefined,
      fleetSize: undefined,
    });
  });

  it('refuses without agreement, a bad address, an unknown role or fleet size, or long words', async () => {
    const { deps, testers } = setup();
    for (const [input, reason] of [
      [{ ...good, consent: false }, 'consent'],
      [{ ...good, email: 'not-an-email' }, 'email'],
      [{ ...good, role: 'astronaut' }, 'role'],
      [{ ...good, fleetSize: '1000' }, 'fleet_size'],
      [{ ...good, name: 'x'.repeat(81) }, 'name'],
      [{ ...good, company: 'x'.repeat(121) }, 'company'],
    ] as const) {
      expect(await signUp(deps, input)).toEqual({
        ok: false,
        error: { tag: 'InvalidSignup', reason },
      });
    }
    expect(testers.rows.size).toBe(0);
  });

  it('succeeds again for an address already held, and changes nothing, so it never says who is on the list', async () => {
    const { deps, testers } = setup();
    await signUp(deps, { ...good, name: 'Sam' });
    const again = await signUp(deps, { ...good, email: 'SAM@example.com', name: 'Someone else' });
    expect(again.ok).toBe(true);
    expect(testers.rows.size).toBe(1);
    expect([...testers.rows.values()][0]?.name).toBe('Sam');
  });

  it('stops at the day’s cap, and starts again the next day', async () => {
    const { deps, testers, clock } = setup();
    for (let i = 0; i < DAILY_CAP; i += 1) {
      await signUp(deps, { ...good, email: `person${i}@example.com` });
    }
    expect(await signUp(deps, { ...good, email: 'one-more@example.com' })).toEqual({
      ok: false,
      error: { tag: 'TooManySignups' },
    });
    expect(testers.rows.size).toBe(DAILY_CAP);
    clock.set('2026-10-10T00:05:00.000Z');
    expect((await signUp(deps, { ...good, email: 'one-more@example.com' })).ok).toBe(true);
  });
});

describe('removing and listing', () => {
  it('takes an address off, whatever its case, and says the same whether or not it was there', async () => {
    const { deps, testers } = setup();
    await signUp(deps, good);
    await removeMe(deps, ' SAM@example.com ');
    expect(testers.rows.size).toBe(0);
    await expect(removeMe(deps, 'nobody@example.com')).resolves.toBeUndefined();
  });

  it('lists and deletes for WagonWise staff only', async () => {
    const { deps, testers } = setup();
    await signUp(deps, good);
    await signUp(deps, { ...good, email: 'kim@example.com' });
    const listed = await listTesters(deps, platform);
    expect(listed.ok && listed.value.total).toBe(2);
    expect(await listTesters(deps, fleet)).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    const id = [...testers.rows.keys()][0] as string;
    expect(await deleteTester(deps, fleet, makeId<'TesterId'>(id))).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await deleteTester(deps, platform, makeId<'TesterId'>(id))).ok).toBe(true);
    expect(await deleteTester(deps, platform, makeId<'TesterId'>(id))).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});

describe('sendInvites', () => {
  const link = 'https://play.google.com/apps/testing/example';

  function inviteSetup() {
    const base = setup();
    const sent: { to: string; text: string }[] = [];
    let n = 0;
    const state = { failFor: undefined as string | undefined };
    const invites: InvitePorts = {
      newInviteCode: () => Promise.resolve(`CODE${(n += 1)}`),
      sendEmail: (to, _subject, text) => {
        if (to === state.failFor) return Promise.reject(new Error('mail down'));
        sent.push({ to, text });
        return Promise.resolve();
      },
    };
    return { ...base, deps: { ...base.deps, invites }, sent, state };
  }

  const idOf = (testers: InMemoryTesters, email: string) =>
    [...testers.rows.values()].find((t) => t.email === email)?.id as TesterId;

  it('emails each tester their own code, records who was sent it and when, and names them in the email', async () => {
    const { deps, testers, sent, clock } = inviteSetup();
    await signUp(deps, { ...good, name: 'Sam' });
    await signUp(deps, { ...good, email: 'kim@example.com' });
    const sam = idOf(testers, 'sam@example.com');
    const kim = idOf(testers, 'kim@example.com');
    const result = await sendInvites(deps, platform, { ids: [sam, kim], optInLink: link });
    expect(result).toEqual({
      ok: true,
      value: [
        { id: sam, status: 'sent' },
        { id: kim, status: 'sent' },
      ],
    });
    expect(sent.map((m) => m.to)).toEqual(['sam@example.com', 'kim@example.com']);
    expect(sent[0]?.text).toContain('Hello Sam,');
    expect(sent[0]?.text).toContain('CODE1');
    expect(sent[0]?.text).toContain(link);
    expect(sent[1]?.text).toContain('Hello,');
    expect(sent[1]?.text).toContain('CODE2');
    expect(testers.rows.get(sam)).toMatchObject({ inviteCode: 'CODE1', invitedAt: clock.now() });
  });

  it('never sends a second email or code to someone already invited', async () => {
    const { deps, testers, sent } = inviteSetup();
    await signUp(deps, good);
    const sam = idOf(testers, 'sam@example.com');
    await sendInvites(deps, platform, { ids: [sam], optInLink: link });
    const again = await sendInvites(deps, platform, { ids: [sam, sam], optInLink: link });
    expect(again).toEqual({ ok: true, value: [{ id: sam, status: 'already_invited' }] });
    expect(sent).toHaveLength(1);
  });

  it('carries on past a failed email, leaves that person uninvited so it can be tried again, and reports unknown ids', async () => {
    const { deps, testers, sent, state } = inviteSetup();
    await signUp(deps, good);
    await signUp(deps, { ...good, email: 'kim@example.com' });
    const sam = idOf(testers, 'sam@example.com');
    const kim = idOf(testers, 'kim@example.com');
    const ghost = makeId<'TesterId'>('nobody');
    state.failFor = 'sam@example.com';
    const result = await sendInvites(deps, platform, { ids: [sam, kim, ghost], optInLink: link });
    expect(result).toEqual({
      ok: true,
      value: [
        { id: sam, status: 'failed' },
        { id: kim, status: 'sent' },
        { id: ghost, status: 'not_found' },
      ],
    });
    expect(testers.rows.get(sam)?.invitedAt).toBeUndefined();
    state.failFor = undefined;
    await sendInvites(deps, platform, { ids: [sam], optInLink: link });
    expect(sent.map((m) => m.to)).toEqual(['kim@example.com', 'sam@example.com']);
  });

  it('is for WagonWise staff only, and takes a limited number at once', async () => {
    const { deps, testers, sent } = inviteSetup();
    await signUp(deps, good);
    const sam = idOf(testers, 'sam@example.com');
    expect(await sendInvites(deps, fleet, { ids: [sam], optInLink: link })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(sent).toHaveLength(0);
    const many = Array.from({ length: MAX_INVITES_PER_SEND + 10 }, (_, i) =>
      makeId<'TesterId'>(`x${i}`),
    );
    const result = await sendInvites(deps, platform, { ids: many, optInLink: link });
    expect(result.ok && result.value).toHaveLength(MAX_INVITES_PER_SEND);
  });
});
