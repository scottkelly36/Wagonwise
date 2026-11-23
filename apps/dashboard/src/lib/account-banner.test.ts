import { describe, expect, it } from 'vitest';
import { accountBanner, daysBetween, exportsPausedMessage } from './account-banner';

const company = '71000000-0000-4000-8000-000000000001';
const state = (status: 'trial' | 'active' | 'overdue' | 'paused', trialEndsOn: string | null) => ({
  companyId: company,
  status,
  trialEndsOn,
  pausedAt: null,
});

describe('daysBetween', () => {
  it('counts calendar days, across a clock change', () => {
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2);
    expect(daysBetween('2026-11-22', '2026-11-22')).toBe(0);
    expect(daysBetween('2026-11-23', '2026-11-22')).toBe(-1);
  });
});

describe('accountBanner', () => {
  it('says nothing for an active company', () => {
    expect(accountBanner(state('active', null), '2026-11-22')).toBeUndefined();
  });

  it('says what a paused company can still do, and who to contact', () => {
    const banner = accountBanner(state('paused', null), '2026-11-22');
    expect(banner?.tone).toBe('bad');
    expect(banner?.text).toContain('paused');
    expect(banner?.text).toContain('see everything');
    expect(banner?.text).toContain('support@wagon-wise.co.uk');
  });

  it('nudges an overdue company before anything is switched off', () => {
    const banner = accountBanner(state('overdue', null), '2026-11-22');
    expect(banner?.tone).toBe('warn');
    expect(banner?.text).toContain('overdue');
  });

  it('is quiet about a trial until its end is two weeks away', () => {
    expect(accountBanner(state('trial', '2027-02-20'), '2026-11-22')).toBeUndefined();
    expect(accountBanner(state('trial', '2026-12-07'), '2026-11-22')).toBeUndefined();
    const near = accountBanner(state('trial', '2026-12-06'), '2026-11-22');
    expect(near?.tone).toBe('info');
    expect(near?.text).toContain('in 14 days');
    expect(near?.text).toContain('6 December 2026');
  });

  it('says today and tomorrow, and notes a trial that has ended', () => {
    expect(accountBanner(state('trial', '2026-11-22'), '2026-11-22')?.text).toContain('ends today');
    expect(accountBanner(state('trial', '2026-11-23'), '2026-11-22')?.text).toContain(
      'ends tomorrow',
    );
    const ended = accountBanner(state('trial', '2026-11-20'), '2026-11-22');
    expect(ended?.tone).toBe('warn');
    expect(ended?.text).toContain('ended on 20 November 2026');
  });
});

describe('exportsPausedMessage', () => {
  it('says downloads are off, and how to get the records', () => {
    const text = exportsPausedMessage();
    expect(text).toContain('Downloads and printing are switched off');
    expect(text).toContain('support@wagon-wise.co.uk');
  });
});
