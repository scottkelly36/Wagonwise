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
