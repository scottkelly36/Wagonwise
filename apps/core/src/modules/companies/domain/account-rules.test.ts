import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { nextAction } from './account-rules.js';
import {
  DEFAULT_ACCOUNT_SETTINGS,
  type AccountSettings,
  type AccountState,
} from './account-state.js';

const full: AccountSettings = { ...DEFAULT_ACCOUNT_SETTINGS, automation: 'full' };
const noPause: AccountSettings = { ...DEFAULT_ACCOUNT_SETTINGS, automation: 'no_pause' };

const state = (over: Partial<AccountState>): AccountState => ({
  companyId: makeId<'CompanyId'>('c'),
  status: 'trial',
  trialEndsOn: null,
  overdueSince: null,
  pausedAt: null,
  note: '',
  hold: false,
  ...over,
});

describe('nextAction: a trial', () => {
  const trial = (trialEndsOn: string) => state({ status: 'trial', trialEndsOn });

  it('is quiet until two weeks before the end', () => {
    expect(nextAction(trial('2026-12-20'), full, '2026-12-01')).toBeNull();
  });

  it('sends the 14 day email from 14 days out and the 7 day email from 7 days out', () => {
    expect(nextAction(trial('2026-12-15'), full, '2026-12-01')).toEqual({
      type: 'email',
      kind: 'trial_14',
    });
    expect(nextAction(trial('2026-12-15'), full, '2026-12-08')).toEqual({
      type: 'email',
      kind: 'trial_7',
    });
    expect(nextAction(trial('2026-12-15'), full, '2026-12-15')).toEqual({
      type: 'email',
      kind: 'trial_7',
    });
  });

  it('makes the company overdue the day after its last free day', () => {
    expect(nextAction(trial('2026-12-15'), full, '2026-12-16')).toMatchObject({
      type: 'move',
      to: 'overdue',
    });
  });

  it('also does that when the rules are on but never pause', () => {
    expect(nextAction(trial('2026-12-15'), noPause, '2026-12-16')).toMatchObject({ to: 'overdue' });
  });
});

describe('nextAction: an overdue company', () => {
  const overdue = (since: string) =>
    state({ status: 'overdue', overdueSince: new Date(`${since}T08:00:00Z`) });

  it('is written to when it goes overdue, and reminded a week in', () => {
    expect(nextAction(overdue('2026-12-01'), full, '2026-12-01')).toEqual({
      type: 'email',
      kind: 'overdue',
    });
    expect(nextAction(overdue('2026-12-01'), full, '2026-12-07')).toEqual({
      type: 'email',
      kind: 'overdue',
    });
    expect(nextAction(overdue('2026-12-01'), full, '2026-12-08')).toEqual({
      type: 'email',
      kind: 'overdue_week',
    });
  });

  it('is paused once the grace period has passed, if the rules are on in full', () => {
    expect(nextAction(overdue('2026-12-01'), full, '2026-12-14')).toEqual({
      type: 'email',
      kind: 'overdue_week',
    });
    expect(nextAction(overdue('2026-12-01'), full, '2026-12-15')).toMatchObject({
      type: 'move',
      to: 'paused',
    });
  });

  it('is never paused when the rules are on but never pause', () => {
    expect(nextAction(overdue('2026-12-01'), noPause, '2027-02-01')).toEqual({
      type: 'email',
      kind: 'overdue_week',
    });
  });

  it('follows the grace days setting, and a grace of 0 pauses at once', () => {
    expect(
      nextAction(overdue('2026-12-01'), { ...full, graceDays: 30 }, '2026-12-20'),
    ).toMatchObject({ type: 'email' });
    expect(
      nextAction(overdue('2026-12-01'), { ...full, graceDays: 0 }, '2026-12-01'),
    ).toMatchObject({ to: 'paused' });
  });
});

describe('nextAction: who is left alone', () => {
  it('leaves a company with the hold alone, in every state', () => {
    expect(
      nextAction(state({ hold: true, trialEndsOn: '2026-11-01' }), full, '2026-12-01'),
    ).toBeNull();
    expect(
      nextAction(
        state({ hold: true, status: 'overdue', overdueSince: new Date('2026-01-01') }),
        full,
        '2026-12-01',
      ),
    ).toBeNull();
  });

  it('does nothing at all when the rules are off', () => {
    expect(
      nextAction(state({ trialEndsOn: '2026-11-01' }), DEFAULT_ACCOUNT_SETTINGS, '2026-12-01'),
    ).toBeNull();
  });

  it('leaves an active or a paused company alone', () => {
    expect(nextAction(state({ status: 'active' }), full, '2026-12-01')).toBeNull();
    expect(
      nextAction(state({ status: 'paused', pausedAt: new Date('2026-11-01') }), full, '2026-12-01'),
    ).toBeNull();
  });
});
