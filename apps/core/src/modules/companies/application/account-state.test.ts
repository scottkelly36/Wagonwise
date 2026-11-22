import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Actor } from '../domain/staff-account.js';
import {
  getAccountSettings,
  getAccountState,
  getOwnAccountState,
  newCompanyState,
  setAccountSettings,
  setAccountState,
} from './account-state.js';
import { InMemoryAccountStateRepository } from './testing/in-memory-account-state-repository.js';

const COMPANY = makeId<'CompanyId'>('company-1');
const OTHER = makeId<'CompanyId'>('company-2');
const platform: Actor = { kind: 'platform', staffId: makeId<'StaffId'>('admin') };
const fleet: Actor = {
  kind: 'fleet',
  staffId: makeId<'StaffId'>('manager'),
  companyId: COMPANY,
  privileges: ['manage_users', 'manage_fleet'],
};

let states: InMemoryAccountStateRepository;
let clock: FakeClock;
let deps: { states: InMemoryAccountStateRepository; clock: FakeClock; ids: SequentialIdGenerator };

beforeEach(async () => {
  states = new InMemoryAccountStateRepository();
  clock = new FakeClock();
  deps = { states, clock, ids: new SequentialIdGenerator() };
  await states.save(await newCompanyState(deps, COMPANY));
});

describe('newCompanyState', () => {
  it('starts a company on a trial of the length in the settings, from today', async () => {
    const state = await newCompanyState(deps, OTHER);
    expect(state.status).toBe('trial');
    expect(state.hold).toBe(false);
    expect(state.overdueSince).toBeNull();
    expect(state.pausedAt).toBeNull();
    // 90 days by default; the fake clock's day is whatever it is, so work it out the same way.
    const day = clock.now().toISOString().slice(0, 10);
    expect(state.trialEndsOn).not.toBeNull();
    expect(state.trialEndsOn! > day).toBe(true);
  });

  it('uses the settings: a one month trial once the owner shortens it', async () => {
    await setAccountSettings(deps, platform, { defaultTrialDays: 30, graceDays: 14 });
    const short = await newCompanyState(deps, OTHER);
    await setAccountSettings(deps, platform, { defaultTrialDays: 90, graceDays: 14 });
    const long = await newCompanyState(deps, OTHER);
    expect(short.trialEndsOn! < long.trialEndsOn!).toBe(true);
  });

  it('leaves a company already on a trial with the day it was given when the setting changes', async () => {
    const before = (await states.get(COMPANY))?.trialEndsOn;
    await setAccountSettings(deps, platform, { defaultTrialDays: 30, graceDays: 14 });
    expect((await states.get(COMPANY))?.trialEndsOn).toBe(before);
  });
});

describe('getAccountState and getOwnAccountState', () => {
  it('shows WagonWise staff any company, and refuses a company staff member', async () => {
    const seen = await getAccountState(deps, platform, COMPANY);
    expect(seen.ok && seen.value.status).toBe('trial');
    expect(await getAccountState(deps, fleet, COMPANY)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await getAccountState(deps, platform, OTHER)).toEqual({
      ok: false,
      error: { tag: 'CompanyNotFound' },
    });
  });

  it("gives a company's own staff its own state, and WagonWise staff none", async () => {
    const own = await getOwnAccountState(deps, fleet);
    expect(own.ok && own.value.companyId).toBe(COMPANY);
    expect(await getOwnAccountState(deps, platform)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('setAccountState', () => {
  it('pauses a company, noting when and by whom, and logs the move', async () => {
    const result = await setAccountState(deps, platform, COMPANY, {
      status: 'paused',
      note: 'no payment details',
    });
    expect(result.ok && result.value.status).toBe('paused');
    expect(result.ok && result.value.pausedAt).toEqual(clock.now());
    expect(result.ok && result.value.trialEndsOn).toBeNull();
    expect(states.moves).toHaveLength(1);
    expect(states.moves[0]).toMatchObject({
      companyId: COMPANY,
      from: 'trial',
      to: 'paused',
      byStaffId: 'admin',
      note: 'no payment details',
    });
  });

  it('un-pauses a company and clears the paused time', async () => {
    await setAccountState(deps, platform, COMPANY, { status: 'paused', note: '' });
    const result = await setAccountState(deps, platform, COMPANY, {
      status: 'active',
      note: 'paid',
    });
    expect(result.ok && result.value.status).toBe('active');
    expect(result.ok && result.value.pausedAt).toBeNull();
    expect(states.moves.map((m) => m.to)).toEqual(['paused', 'active']);
  });

  it('keeps the first overdue time when set overdue again', async () => {
    await setAccountState(deps, platform, COMPANY, { status: 'overdue', note: '' });
    const first = (await states.get(COMPANY))?.overdueSince;
    clock.advance(60 * 60 * 1000);
    await setAccountState(deps, platform, COMPANY, { status: 'overdue', note: 'still waiting' });
    const second = await states.get(COMPANY);
    expect(second?.overdueSince).toEqual(first);
    expect(second?.note).toBe('still waiting');
    // Staying in the same state is not a move.
    expect(states.moves).toHaveLength(1);
  });

  it('extends a trial with a later day, and fills in the default length when none is given', async () => {
    const extended = await setAccountState(deps, platform, COMPANY, {
      status: 'trial',
      trialEndsOn: '2099-01-01',
      note: 'extended',
    });
    expect(extended.ok && extended.value.trialEndsOn).toBe('2099-01-01');
    const defaulted = await setAccountState(deps, platform, COMPANY, { status: 'trial', note: '' });
    expect(defaulted.ok && defaulted.value.trialEndsOn).not.toBe('2099-01-01');
    expect(defaulted.ok && defaulted.value.trialEndsOn).not.toBeNull();
  });

  it('refuses a trial that ends in the past', async () => {
    const result = await setAccountState(deps, platform, COMPANY, {
      status: 'trial',
      trialEndsOn: '2000-01-01',
      note: '',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidSetting' } });
  });

  it('sets and leaves alone the hold', async () => {
    await setAccountState(deps, platform, COMPANY, { status: 'active', hold: true, note: 'pilot' });
    expect((await states.get(COMPANY))?.hold).toBe(true);
    await setAccountState(deps, platform, COMPANY, { status: 'active', note: 'pilot' });
    expect((await states.get(COMPANY))?.hold).toBe(true);
    await setAccountState(deps, platform, COMPANY, { status: 'active', hold: false, note: '' });
    expect((await states.get(COMPANY))?.hold).toBe(false);
  });

  it('refuses a company staff member, even for their own company, and changes nothing', async () => {
    const result = await setAccountState(deps, fleet, COMPANY, { status: 'active', note: '' });
    expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    expect((await states.get(COMPANY))?.status).toBe('trial');
    expect(states.moves).toHaveLength(0);
  });

  it('answers not found for a company that does not exist', async () => {
    expect(await setAccountState(deps, platform, OTHER, { status: 'active', note: '' })).toEqual({
      ok: false,
      error: { tag: 'CompanyNotFound' },
    });
  });

  it('refuses a note that is too long', async () => {
    const result = await setAccountState(deps, platform, COMPANY, {
      status: 'active',
      note: 'x'.repeat(501),
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidSetting' } });
  });
});

describe('account settings', () => {
  it('are read and changed by WagonWise staff only', async () => {
    expect(await getAccountSettings(deps, platform)).toEqual({
      ok: true,
      value: { defaultTrialDays: 90, graceDays: 14 },
    });
    expect(await getAccountSettings(deps, fleet)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await setAccountSettings(deps, fleet, { defaultTrialDays: 30, graceDays: 7 })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(states.settings).toEqual({ defaultTrialDays: 90, graceDays: 14 });
  });

  it('refuse values out of range', async () => {
    for (const bad of [
      { defaultTrialDays: 0, graceDays: 14 },
      { defaultTrialDays: 366, graceDays: 14 },
      { defaultTrialDays: 30, graceDays: -1 },
      { defaultTrialDays: 30, graceDays: 91 },
      { defaultTrialDays: 1.5, graceDays: 14 },
    ]) {
      expect(await setAccountSettings(deps, platform, bad)).toEqual({
        ok: false,
        error: { tag: 'InvalidSetting' },
      });
    }
    expect(states.settings).toEqual({ defaultTrialDays: 90, graceDays: 14 });
  });

  it('can be set to a one month trial', async () => {
    const result = await setAccountSettings(deps, platform, {
      defaultTrialDays: 30,
      graceDays: 14,
    });
    expect(result.ok && result.value.defaultTrialDays).toBe(30);
  });
});
