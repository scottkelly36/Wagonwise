import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_EMAIL_KINDS,
  buildAccountEmail,
  pauseDay,
  stateFor,
  SUPPORT_EMAIL,
  type AccountEmailInput,
} from './account-emails.js';

const base: AccountEmailInput = {
  kind: 'trial_14',
  recipientName: 'Sam',
  companyName: 'Acme Haulage',
  today: '2026-12-01',
  trialEndsOn: '2026-12-15',
  overdueSince: null,
  graceDays: 14,
  hold: false,
  dashboardUrl: 'https://portal.example.com/',
};

describe('account emails', () => {
  it('names the day the free period ends and says how many days are left', () => {
    const email = buildAccountEmail(base);
    expect(email.subject).toBe(
      'The free period for Acme Haulage on WagonWise ends on 15 December 2026',
    );
    expect(email.text).toContain('Hi Sam,');
    expect(email.text).toContain('ends in 14 days, on 15 December 2026');
    expect(email.text).toContain('https://portal.example.com/staff/plan');
    expect(email.text).toContain(SUPPORT_EMAIL);
  });

  it('says tomorrow and today rather than a number', () => {
    expect(buildAccountEmail({ ...base, trialEndsOn: '2026-12-02' }).text).toContain(
      'ends tomorrow, on 2 December 2026',
    );
    expect(buildAccountEmail({ ...base, trialEndsOn: '2026-12-01' }).text).toContain(
      'ends today, on 1 December 2026',
    );
  });

  it('leaves the link out when the portal address is not known', () => {
    expect(buildAccountEmail({ ...base, dashboardUrl: undefined }).text).not.toContain(
      '/staff/plan',
    );
  });

  it('refuses to write a trial email with no end day', () => {
    expect(() => buildAccountEmail({ ...base, trialEndsOn: null })).toThrow();
  });

  it('says when an overdue company would be paused, and that nothing is switched off yet', () => {
    const email = buildAccountEmail({ ...base, kind: 'overdue', overdueSince: '2026-12-01' });
    expect(email.subject).toBe('Payment for Acme Haulage on WagonWise is overdue');
    expect(email.text).toContain('Nothing has been switched off.');
    expect(email.text).toContain('paused');
    expect(email.text).toContain('15 December 2026');
  });

  it('does not promise a pause day to a company that is held', () => {
    const email = buildAccountEmail({
      ...base,
      kind: 'overdue',
      overdueSince: '2026-12-01',
      hold: true,
    });
    expect(email.text).not.toContain('15 December 2026');
    expect(email.text).toContain('may be paused');
  });

  it('is a reminder the second time', () => {
    const email = buildAccountEmail({ ...base, kind: 'overdue_week', overdueSince: '2026-11-24' });
    expect(email.subject).toContain('Reminder');
    expect(email.text).toContain('8 December 2026');
  });

  it('says only what a pause does: reads stay, nothing is changed, drivers lose the jobs, nothing is deleted', () => {
    const { text } = buildAccountEmail({ ...base, kind: 'paused' });
    expect(text).toContain('can still sign in and read every page');
    expect(text).toContain('Nothing can be changed');
    expect(text).toContain('no longer see your jobs');
    expect(text).toContain('routing, hazard warnings and SOS');
    expect(text).toContain('Nothing has been deleted');
  });

  it('works out the pause day from the grace period', () => {
    expect(pauseDay({ overdueSince: '2026-12-01', graceDays: 14, hold: false })).toBe('2026-12-15');
    expect(pauseDay({ overdueSince: '2026-12-01', graceDays: 14, hold: true })).toBeNull();
    expect(pauseDay({ overdueSince: null, graceDays: 14, hold: false })).toBeNull();
  });

  it('every kind belongs to one of the states a company can be written to about', () => {
    for (const kind of ACCOUNT_EMAIL_KINDS) {
      expect(['trial', 'overdue', 'paused', 'active']).toContain(stateFor(kind));
    }
  });
});
