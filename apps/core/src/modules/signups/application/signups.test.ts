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
  confirmTrial,
  deleteTester,
  listTesters,
  MAX_INVITES_PER_SEND,
  previewTrial,
  sendInvites,
  sendLaunchEmails,
  type FirmStarter,
  type InvitePorts,
  removeMe,
  signUp,
  type SignupDeps,
  type StaffCaller,
  type TesterRepository,
  type TrialTokens,
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

  markLaunchEmailed(id: TesterId, at: Date): Promise<void> {
    const t = this.rows.get(id);
    if (t !== undefined) this.rows.set(id, { ...t, launchEmailedAt: at });
    return Promise.resolve();
  }

  markTrialStarted(id: TesterId, companyId: string, at: Date): Promise<void> {
    const t = this.rows.get(id);
    if (t !== undefined) this.rows.set(id, { ...t, trialStartedAt: at, trialCompanyId: companyId });
    return Promise.resolve();
  }

  findByEmail(email: string): Promise<Tester | null> {
    return Promise.resolve([...this.rows.values()].find((t) => t.email === email) ?? null);
  }

  readonly links = new Map<string, TesterId>();

  setTrialLink(id: TesterId, tokenHash: string, expiresAt: Date): Promise<void> {
    const t = this.rows.get(id);
    if (t === undefined) return Promise.resolve();
    for (const [hash, owner] of this.links) if (owner === id) this.links.delete(hash);
    this.links.set(tokenHash, id);
    this.rows.set(id, { ...t, trialLinkExpiresAt: expiresAt });
    return Promise.resolve();
  }

  findByTrialLink(tokenHash: string): Promise<Tester | null> {
    const id = this.links.get(tokenHash);
    return Promise.resolve(id === undefined ? null : (this.rows.get(id) ?? null));
  }

  countTrialsStartedSince(since: Date): Promise<number> {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (t) => t.trialStartedAt !== undefined && t.trialStartedAt >= since,
      ).length,
    );
  }

  countTrialsStartedFromDomain(domain: string): Promise<number> {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (t) => t.trialStartedAt !== undefined && t.email.endsWith('@' + domain),
      ).length,
    );
  }

  claimTrial(id: TesterId, at: Date): Promise<boolean> {
    const t = this.rows.get(id);
    if (t === undefined || t.trialStartedAt !== undefined) return Promise.resolve(false);
    this.rows.set(id, { ...t, trialStartedAt: at });
    return Promise.resolve(true);
  }

  releaseTrial(id: TesterId): Promise<void> {
    const t = this.rows.get(id);
    if (t !== undefined && t.trialCompanyId === undefined) {
      this.rows.set(id, { ...t, trialStartedAt: undefined });
    }
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
      [{ ...good, email: 'sam@gmail.comg' }, 'email'],
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

describe('sendLaunchEmails', () => {
  const links = {
    appStoreLink: 'https://apps.apple.com/gb/app/wagonwise/id1',
    playStoreLink: 'https://play.google.com/store/apps/details?id=com.wagonwise.driverapp',
  };

  function launchSetup() {
    const base = setup();
    const sent: { to: string; subject: string; text: string; html: string | undefined }[] = [];
    const state = { failFor: undefined as string | undefined };
    const invites: InvitePorts = {
      newInviteCode: () => Promise.reject(new Error('a launch email makes no invite code')),
      sendEmail: (to, subject, text, html) => {
        if (to === state.failFor) return Promise.reject(new Error('mail down'));
        sent.push({ to, subject, text, html });
        return Promise.resolve();
      },
    };
    return { ...base, deps: { ...base.deps, invites }, sent, state };
  }

  const idOf = (testers: InMemoryTesters, email: string) =>
    [...testers.rows.values()].find((t) => t.email === email)?.id as TesterId;

  it('emails each tester the HTML and text versions with both store links, and records when', async () => {
    const { deps, testers, sent, clock } = launchSetup();
    await signUp(deps, { ...good, name: 'Sam' });
    await signUp(deps, { ...good, email: 'kim@example.com' });
    const sam = idOf(testers, 'sam@example.com');
    const kim = idOf(testers, 'kim@example.com');
    const result = await sendLaunchEmails(deps, platform, { ids: [sam, kim], ...links });
    expect(result).toEqual({
      ok: true,
      value: [
        { id: sam, status: 'sent' },
        { id: kim, status: 'sent' },
      ],
    });
    expect(sent.map((m) => m.to)).toEqual(['sam@example.com', 'kim@example.com']);
    expect(sent[0]?.subject).toBe('WagonWise is out now on iPhone and Android');
    expect(sent[0]?.text).toContain('Hello Sam,');
    expect(sent[0]?.html).toContain('Hello Sam,');
    for (const m of sent) {
      expect(m.text).toContain(links.appStoreLink);
      expect(m.text).toContain(links.playStoreLink);
      expect(m.html).toContain(links.appStoreLink);
    }
    expect(testers.rows.get(sam)?.launchEmailedAt).toEqual(clock.now());
  });

  it('never sends a second one to the same person', async () => {
    const { deps, testers, sent } = launchSetup();
    await signUp(deps, good);
    const sam = idOf(testers, 'sam@example.com');
    await sendLaunchEmails(deps, platform, { ids: [sam], ...links });
    const again = await sendLaunchEmails(deps, platform, { ids: [sam, sam], ...links });
    expect(again).toEqual({ ok: true, value: [{ id: sam, status: 'already_sent' }] });
    expect(sent).toHaveLength(1);
  });

  it('carries on past a failed email, leaves that person unmarked so it can be retried, and reports unknown ids', async () => {
    const { deps, testers, sent, state } = launchSetup();
    await signUp(deps, good);
    await signUp(deps, { ...good, email: 'kim@example.com' });
    const sam = idOf(testers, 'sam@example.com');
    const kim = idOf(testers, 'kim@example.com');
    const ghost = makeId<'TesterId'>('nobody');
    state.failFor = 'sam@example.com';
    const result = await sendLaunchEmails(deps, platform, { ids: [sam, kim, ghost], ...links });
    expect(result).toEqual({
      ok: true,
      value: [
        { id: sam, status: 'failed' },
        { id: kim, status: 'sent' },
        { id: ghost, status: 'not_found' },
      ],
    });
    expect(testers.rows.get(sam)?.launchEmailedAt).toBeUndefined();
    state.failFor = undefined;
    await sendLaunchEmails(deps, platform, { ids: [sam], ...links });
    expect(sent.map((m) => m.to)).toEqual(['kim@example.com', 'sam@example.com']);
  });

  it('is for WagonWise staff only, and takes a limited number at once', async () => {
    const { deps, testers, sent } = launchSetup();
    await signUp(deps, good);
    const sam = idOf(testers, 'sam@example.com');
    expect(await sendLaunchEmails(deps, fleet, { ids: [sam], ...links })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(sent).toHaveLength(0);
    const many = Array.from({ length: MAX_INVITES_PER_SEND + 10 }, (_, i) =>
      makeId<'TesterId'>(`x${i}`),
    );
    const result = await sendLaunchEmails(deps, platform, { ids: many, ...links });
    expect(result.ok && result.value).toHaveLength(MAX_INVITES_PER_SEND);
  });
});

describe('telling the owner, and thanking a firm that registers', () => {
  function withNotifier() {
    const { deps, testers, clock } = setup();
    const owner: { subject: string; text: string }[] = [];
    const registrant: { to: string; subject: string; text: string }[] = [];
    const notify = {
      toOwner: (subject: string, text: string) => {
        owner.push({ subject, text });
        return Promise.resolve();
      },
      toRegistrant: (to: string, subject: string, text: string) => {
        registrant.push({ to, subject, text });
        return Promise.resolve();
      },
      portalAddress: 'https://dashboard.example.com/',
    };
    return { deps: { ...deps, notify }, testers, clock, owner, registrant };
  }
  const firm = {
    email: 'sam@carter-haulage.example.com',
    name: 'Sam Carter',
    role: 'company',
    company: 'Carter Haulage',
    fleetSize: '6-15',
    consent: true,
  };

  it('tells the owner who registered and where to start a trial, and thanks the firm', async () => {
    const { deps, owner, registrant } = withNotifier();
    expect((await signUp(deps, firm)).ok).toBe(true);
    expect(owner).toHaveLength(1);
    expect(owner[0]?.subject).toBe('New firm registered: Carter Haulage');
    expect(owner[0]?.text).toContain('sam@carter-haulage.example.com');
    expect(owner[0]?.text).toContain('Vehicles: 6-15');
    expect(owner[0]?.text).toContain('https://dashboard.example.com/admin/testers');
    expect(registrant).toHaveLength(1);
    expect(registrant[0]?.to).toBe('sam@carter-haulage.example.com');
    expect(registrant[0]?.text).toContain('usually within one working day');
    expect(registrant[0]?.text).toContain('Remove my email');
  });

  it('sends nothing for a driver, and nothing again for an address already registered', async () => {
    const { deps, owner, registrant } = withNotifier();
    await signUp(deps, { email: 'dan@example.com', role: 'driver', consent: true });
    expect(owner).toHaveLength(0);
    expect(registrant).toHaveLength(0);
    await signUp(deps, firm);
    await signUp(deps, firm);
    expect(owner).toHaveLength(1);
    expect(registrant).toHaveLength(1);
  });

  it('is not held up or turned down by a failing email, and works with no notifier at all', async () => {
    const { deps } = withNotifier();
    const failing = {
      ...deps,
      notify: {
        toOwner: () => Promise.reject(new Error('mail down')),
        toRegistrant: () => Promise.reject(new Error('mail down')),
      },
    };
    expect((await signUp(failing, firm)).ok).toBe(true);
    expect((await signUp(setup().deps, { ...firm, email: 'lee@carter.example.com' })).ok).toBe(
      true,
    );
  });

  it('asks for nothing it was not given: a firm with only an email still gets a sensible message', async () => {
    const { deps, owner, registrant } = withNotifier();
    await signUp(deps, { email: 'zed@example.com', role: 'company', consent: true });
    expect(owner[0]?.subject).toBe('New firm registered: zed@example.com');
    expect(registrant[0]?.text.startsWith('Hello,')).toBe(true);
    expect(registrant[0]?.text).toContain('your firm');
  });
});

describe('a firm starting its own trial from the link it was emailed', () => {
  const PORTAL = 'https://dashboard.example.com/';

  class FakeTokens implements TrialTokens {
    #n = 0;
    generate(): string {
      this.#n += 1;
      return `secret-token-number-${String(this.#n).padStart(4, '0')}`;
    }
    hash(token: string): string {
      return `hash:${token}`;
    }
  }

  function linked() {
    const { deps, testers, clock } = setup();
    const owner: { subject: string; text: string }[] = [];
    const registrant: { to: string; subject: string; text: string }[] = [];
    const notify = {
      toOwner: (subject: string, text: string) => {
        owner.push({ subject, text });
        return Promise.resolve();
      },
      toRegistrant: (to: string, subject: string, text: string) => {
        registrant.push({ to, subject, text });
        return Promise.resolve();
      },
      portalAddress: PORTAL,
    };
    const made: { firmName: string; contactName: string; contactEmail: string }[] = [];
    const firms: FirmStarter = {
      startTrialFirm: () => Promise.reject(new Error('not used here')),
      startSelfServeTrialFirm: (input) => {
        made.push(input);
        return Promise.resolve({
          ok: true as const,
          value: {
            companyId: `company-${made.length}`,
            emailed: true,
            inviteToken: 't',
            vehicles: 5,
          },
        });
      },
    };
    const all = { ...deps, notify, tokens: new FakeTokens() };
    const scoped = <T>(work: () => Promise<T>): Promise<T> => work();
    /** The link in the thank-you email sent to an address, as its token. */
    const tokenSentTo = (to: string): string => {
      const text = [...registrant].reverse().find((m) => m.to === to)?.text ?? '';
      const found = /start-trial\?token=([^\s]+)/.exec(text);
      if (found?.[1] === undefined) throw new Error('no link was sent to ' + to);
      return decodeURIComponent(found[1]);
    };
    return { deps: all, firms, testers, clock, owner, registrant, made, scoped, tokenSentTo };
  }

  const firm = {
    email: 'sam@carter-haulage.example.com',
    name: 'Sam Carter',
    role: 'company',
    company: 'Carter Haulage',
    consent: true,
  };

  it('is emailed a link that starts the trial, and the owner is told nothing is needed from them', async () => {
    const { deps, owner, registrant, tokenSentTo, testers } = linked();
    expect((await signUp(deps, firm)).ok).toBe(true);
    expect(registrant).toHaveLength(1);
    expect(registrant[0]?.text).toContain('https://dashboard.example.com/start-trial?token=');
    expect(registrant[0]?.text).not.toContain('usually within one working day');
    expect(tokenSentTo(firm.email)).toMatch(/^secret-token-number-/);
    // Only a hash is kept.
    expect([...testers.links.keys()].every((k) => k.startsWith('hash:'))).toBe(true);
    expect(owner[0]?.text).toContain('You need do nothing');
  });

  it('keeps the old way with no link when there is nothing to point at or to make a secret with', async () => {
    const { deps, registrant } = linked();
    await signUp({ ...deps, tokens: undefined }, firm);
    await signUp(
      { ...deps, notify: { ...deps.notify, portalAddress: undefined } },
      {
        ...firm,
        email: 'lee@other.example.com',
      },
    );
    expect(registrant).toHaveLength(2);
    for (const m of registrant) {
      expect(m.text).toContain('usually within one working day');
      expect(m.text).not.toContain('start-trial');
    }
  });

  it('sends a driver no link', async () => {
    const { deps, registrant, owner, testers } = linked();
    await signUp(deps, { email: 'dan@example.com', role: 'driver', consent: true });
    expect(registrant).toHaveLength(0);
    expect(owner).toHaveLength(0);
    expect(testers.links.size).toBe(0);
  });

  it('sends a fresh link to an address that registers again only after an hour, and then the old link no longer works', async () => {
    const { deps, registrant, clock, tokenSentTo, scoped } = linked();
    await signUp(deps, firm);
    const first = tokenSentTo(firm.email);
    await signUp(deps, firm);
    clock.advance(30 * 60 * 1000);
    await signUp(deps, firm);
    expect(registrant).toHaveLength(1);
    clock.advance(31 * 60 * 1000);
    await signUp(deps, firm);
    expect(registrant).toHaveLength(2);
    const second = tokenSentTo(firm.email);
    expect(second).not.toBe(first);
    expect((await previewTrial(deps, first)).valid).toBe(false);
    expect((await previewTrial(deps, second)).valid).toBe(true);
    expect(scoped).toBeDefined();
  });

  it('sends nothing more to a firm that has already started its trial', async () => {
    const { deps, registrant, clock, firms, tokenSentTo, scoped } = linked();
    await signUp(deps, firm);
    await confirmTrial({ ...deps, firms }, { token: tokenSentTo(firm.email) }, scoped);
    clock.advance(5 * 60 * 60 * 1000);
    await signUp(deps, firm);
    expect(registrant).toHaveLength(1);
  });

  it('shows the link its address, and asks for a firm name only when there is none', async () => {
    const { deps, tokenSentTo } = linked();
    await signUp(deps, firm);
    await signUp(deps, { email: 'zed@bare.example.com', role: 'company', consent: true });
    expect(await previewTrial(deps, tokenSentTo(firm.email))).toEqual({
      valid: true,
      started: false,
      needsCompany: false,
      email: firm.email,
      company: 'Carter Haulage',
    });
    expect(await previewTrial(deps, tokenSentTo('zed@bare.example.com'))).toMatchObject({
      needsCompany: true,
    });
  });

  it('says a wrong, empty or expired link is not valid, without saying which', async () => {
    const { deps, clock, tokenSentTo } = linked();
    await signUp(deps, firm);
    expect(await previewTrial(deps, 'not-a-real-token-at-all-nope')).toEqual({ valid: false });
    expect(await previewTrial({ ...deps, tokens: undefined }, tokenSentTo(firm.email))).toEqual({
      valid: false,
    });
    clock.advance(49 * 60 * 60 * 1000);
    expect(await previewTrial(deps, tokenSentTo(firm.email))).toEqual({ valid: false });
  });

  it('starts the trial: makes the firm once, notes it, tells the owner, and a second press makes nothing', async () => {
    const { deps, firms, made, owner, tokenSentTo, scoped, testers } = linked();
    await signUp(deps, firm);
    const token = tokenSentTo(firm.email);
    const first = await confirmTrial({ ...deps, firms }, { token }, scoped);
    expect(first).toEqual({ status: 'started', vehicles: 5 });
    expect(made).toEqual([
      { firmName: 'Carter Haulage', contactName: 'Sam Carter', contactEmail: firm.email },
    ]);
    const tester = [...testers.rows.values()][0];
    expect(tester?.trialCompanyId).toBe('company-1');
    expect(owner.at(-1)?.subject).toBe('Trial started: Carter Haulage');
    expect(await confirmTrial({ ...deps, firms }, { token }, scoped)).toEqual({
      status: 'already_started',
    });
    expect(made).toHaveLength(1);
  });

  it('makes one firm when the button is pressed twice at once', async () => {
    const { deps, firms, made, tokenSentTo, scoped } = linked();
    await signUp(deps, firm);
    const token = tokenSentTo(firm.email);
    const results = await Promise.all([
      confirmTrial({ ...deps, firms }, { token }, scoped),
      confirmTrial({ ...deps, firms }, { token }, scoped),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['already_started', 'started']);
    expect(made).toHaveLength(1);
  });

  it('asks for a firm name when the registration had none, and uses the one typed', async () => {
    const { deps, firms, made, tokenSentTo, scoped } = linked();
    await signUp(deps, { email: 'zed@bare.example.com', role: 'company', consent: true });
    const token = tokenSentTo('zed@bare.example.com');
    expect(await confirmTrial({ ...deps, firms }, { token }, scoped)).toEqual({
      status: 'needs_company',
    });
    expect(made).toHaveLength(0);
    const started = await confirmTrial(
      { ...deps, firms },
      { token, company: '  Zed Haulage  ' },
      scoped,
    );
    expect(started.status).toBe('started');
    expect(made[0]?.firmName).toBe('Zed Haulage');
    expect(made[0]?.contactName).toBe('there');
  });

  it('turns an invalid link away and makes nothing', async () => {
    const { deps, firms, made, scoped } = linked();
    expect(await confirmTrial({ ...deps, firms }, { token: 'x'.repeat(30) }, scoped)).toEqual({
      status: 'invalid',
    });
    expect(made).toHaveLength(0);
  });

  it('gives the claim back and says so when the address already has an account, so it can try again', async () => {
    const { deps, tokenSentTo, scoped, testers } = linked();
    await signUp(deps, firm);
    const inUse: FirmStarter = {
      startTrialFirm: () => Promise.reject(new Error('not used here')),
      startSelfServeTrialFirm: () =>
        Promise.resolve({ ok: false as const, error: { tag: 'EmailAlreadyInUse' as const } }),
    };
    const result = await confirmTrial(
      { ...deps, firms: inUse },
      { token: tokenSentTo(firm.email) },
      scoped,
    );
    expect(result).toEqual({ status: 'email_in_use' });
    expect([...testers.rows.values()][0]?.trialStartedAt).toBeUndefined();
  });

  it('holds the firm for the owner, and tells them, once the day has had its limit of automatic trials', async () => {
    const { deps, firms, made, owner, tokenSentTo, scoped } = linked();
    for (let i = 0; i < 10; i++) {
      const email = `firm${i}@fleet${i}.example.com`;
      await signUp(deps, { ...firm, email, company: `Firm ${i}` });
      expect(
        (await confirmTrial({ ...deps, firms }, { token: tokenSentTo(email) }, scoped)).status,
      ).toBe('started');
    }
    await signUp(deps, firm);
    const result = await confirmTrial(
      { ...deps, firms },
      { token: tokenSentTo(firm.email) },
      scoped,
    );
    expect(result).toEqual({ status: 'waiting' });
    expect(made).toHaveLength(10);
    expect(owner.at(-1)?.subject).toBe('Trial waiting for you: Carter Haulage');
    expect(owner.at(-1)?.text).toContain('limit on trials started without you for today');
  });

  it('holds a second firm from the same business domain, but not a second from a free-mail one', async () => {
    const { deps, firms, made, owner, tokenSentTo, scoped } = linked();
    await signUp(deps, { ...firm, email: 'a@acme-haulage.example.com' });
    await signUp(deps, { ...firm, email: 'b@acme-haulage.example.com', company: 'Acme North' });
    expect(
      (
        await confirmTrial(
          { ...deps, firms },
          { token: tokenSentTo('a@acme-haulage.example.com') },
          scoped,
        )
      ).status,
    ).toBe('started');
    expect(
      (
        await confirmTrial(
          { ...deps, firms },
          { token: tokenSentTo('b@acme-haulage.example.com') },
          scoped,
        )
      ).status,
    ).toBe('waiting');
    expect(owner.at(-1)?.text).toContain('same email domain');
    // Free-mail owner-drivers are each their own firm.
    for (const who of ['one@gmail.com', 'two@gmail.com', 'three@outlook.com']) {
      await signUp(deps, { ...firm, email: who, company: who });
      expect(
        (await confirmTrial({ ...deps, firms }, { token: tokenSentTo(who) }, scoped)).status,
      ).toBe('started');
    }
    expect(made).toHaveLength(4);
  });
});
