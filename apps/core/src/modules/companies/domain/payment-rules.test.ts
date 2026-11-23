import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { nextAction, paymentMove, type PaymentFact } from './account-rules.js';
import { buildAccountEmail, stateFor } from './account-emails.js';
import {
  DEFAULT_ACCOUNT_SETTINGS,
  type AccountSettings,
  type AccountState,
} from './account-state.js';

const full: AccountSettings = { ...DEFAULT_ACCOUNT_SETTINGS, automation: 'full' };
const off: AccountSettings = { ...DEFAULT_ACCOUNT_SETTINGS, automation: 'off' };

const state = (over: Partial<AccountState>): AccountState => ({
  companyId: makeId<'CompanyId'>('c'),
  status: 'active',
  trialEndsOn: null,
  overdueSince: null,
  pausedAt: null,
  note: '',
  hold: false,
  ...over,
});

const fact = (kind: PaymentFact['kind'], owesAnything = false): PaymentFact => ({
  kind,
  owesAnything,
});

describe('paymentMove: getting a company back', () => {
  it('makes an overdue or paused company active when details are added and nothing is owed', () => {
    for (const status of ['overdue', 'paused'] as const) {
      expect(paymentMove(state({ status }), full, fact('details_added'))).toMatchObject({
        to: 'active',
      });
    }
  });

  it('does not, while something is still owed: details alone do not pay an invoice', () => {
    expect(paymentMove(state({ status: 'paused' }), full, fact('details_added', true))).toBeNull();
  });

  it('makes it active when everything is paid', () => {
    expect(paymentMove(state({ status: 'paused' }), full, fact('paid_in_full'))).toMatchObject({
      to: 'active',
      note: 'Automatic: payment received',
    });
  });

  it("is not held back by the owner's hold or by the rules being off: getting someone back is always good", () => {
    expect(
      paymentMove(state({ status: 'paused', hold: true }), off, fact('paid_in_full')),
    ).toMatchObject({
      to: 'active',
    });
  });

  it('leaves a company that is already active, or on a trial, where it is', () => {
    expect(paymentMove(state({ status: 'active' }), full, fact('paid_in_full'))).toBeNull();
    expect(paymentMove(state({ status: 'trial' }), full, fact('details_added'))).toBeNull();
  });
});

describe('paymentMove: a failed payment', () => {
  it('makes an active company overdue when the rules are on', () => {
    expect(
      paymentMove(state({ status: 'active' }), full, fact('payment_failed', true)),
    ).toMatchObject({
      to: 'overdue',
    });
  });

  it('does nothing while the rules are off, to a company with the hold, or to one that is not active', () => {
    expect(paymentMove(state({}), off, fact('payment_failed', true))).toBeNull();
    expect(paymentMove(state({ hold: true }), full, fact('payment_failed', true))).toBeNull();
    expect(paymentMove(state({ status: 'trial' }), full, fact('payment_failed', true))).toBeNull();
    expect(paymentMove(state({ status: 'paused' }), full, fact('payment_failed', true))).toBeNull();
  });
});

describe('nextAction with payment details on file', () => {
  const ended = state({ status: 'trial', trialEndsOn: '2026-12-15' });

  it('makes a finished free period active rather than overdue', () => {
    expect(nextAction(ended, full, '2026-12-16', true)).toMatchObject({
      type: 'move',
      to: 'active',
    });
    expect(nextAction(ended, full, '2026-12-16', false)).toMatchObject({
      type: 'move',
      to: 'overdue',
    });
  });

  it('still waits until the day after the last free day, and still leaves a hold alone', () => {
    expect(nextAction(ended, full, '2026-12-15', true)).toMatchObject({ type: 'email' });
    expect(nextAction({ ...ended, hold: true }, full, '2026-12-16', true)).toBeNull();
  });
});

describe('the "active again" email', () => {
  it('is for an active company, and says only what is true', () => {
    expect(stateFor('resumed')).toBe('active');
    const email = buildAccountEmail({
      kind: 'resumed',
      recipientName: 'Sam',
      companyName: 'Acme Haulage',
      today: '2026-12-01',
      trialEndsOn: null,
      overdueSince: null,
      graceDays: 14,
      hold: false,
      dashboardUrl: undefined,
    });
    expect(email.subject).toBe('The WagonWise account for Acme Haulage is active again');
    expect(email.text).toContain('Nothing was deleted');
    expect(email.text).toContain('drivers see your jobs as before');
  });
});
