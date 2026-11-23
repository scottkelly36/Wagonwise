import { describe, expect, it } from 'vitest';
import { ACCOUNT_EMAIL_OPTIONS, canSendToCompany, sentMessage } from './account-emails';

describe('canSendToCompany', () => {
  it('only lets an email go to a company in the state it is about', () => {
    expect(canSendToCompany('paused', 'paused')).toBe(true);
    expect(canSendToCompany('paused', 'active')).toBe(false);
    expect(canSendToCompany('trial_7', 'trial')).toBe(true);
    expect(canSendToCompany('trial_7', 'overdue')).toBe(false);
    expect(canSendToCompany('overdue_week', 'overdue')).toBe(true);
  });

  it('offers every kind the server knows', () => {
    expect(ACCOUNT_EMAIL_OPTIONS.map((o) => o.kind)).toEqual([
      'trial_14',
      'trial_7',
      'overdue',
      'overdue_week',
      'paused',
    ]);
  });
});

describe('sentMessage', () => {
  it('says how many people were written to', () => {
    expect(sentMessage('company', { sent: 1, alreadySent: false })).toBe(
      'Sent to 1 person at the company.',
    );
    expect(sentMessage('company', { sent: 3, alreadySent: false })).toBe(
      'Sent to 3 people at the company.',
    );
  });

  it('says plainly when nothing was sent because it had already gone', () => {
    expect(sentMessage('company', { sent: 0, alreadySent: true })).toContain('nothing was sent');
  });

  it('says a test copy went to the owner only', () => {
    expect(sentMessage('me', { sent: 1, alreadySent: false })).toContain('your own address');
  });
});
