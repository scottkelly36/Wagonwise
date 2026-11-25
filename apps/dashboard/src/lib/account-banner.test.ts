import { describe, expect, it } from 'vitest';
import {
  accountBanner,
  accountStanding,
  amountDue,
  daysBetween,
  exportsPausedMessage,
  trialPlanText,
} from './account-banner';

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

describe('accountStanding', () => {
  it('always says where the account stands, even when the banner is quiet', () => {
    expect(accountBanner(state('active', null), '2026-11-22')).toBeUndefined();
    expect(accountStanding(state('active', null), '2026-11-22')).toMatchObject({
      tone: 'ok',
      headline: 'Your account is active.',
    });
    expect(accountStanding(state('trial', '2027-02-20'), '2026-11-22').headline).toBe(
      'Your free period ends in 90 days, on 20 February 2027.',
    );
  });

  it('says tomorrow and today, and when the free period is over', () => {
    expect(accountStanding(state('trial', '2026-11-23'), '2026-11-22').headline).toContain(
      'ends tomorrow',
    );
    expect(accountStanding(state('trial', '2026-11-22'), '2026-11-22').headline).toContain(
      'ends today',
    );
    expect(accountStanding(state('trial', '2026-11-20'), '2026-11-22')).toMatchObject({
      tone: 'warn',
      headline: 'Your free period ended on 20 November 2026.',
    });
  });

  it('says what an overdue and a paused account mean', () => {
    expect(accountStanding(state('overdue', null), '2026-11-22')).toMatchObject({
      tone: 'warn',
      headline: 'Payment is overdue.',
    });
    const paused = accountStanding(state('paused', null), '2026-11-22');
    expect(paused.tone).toBe('bad');
    expect(paused.detail).toContain('cannot change anything');
    expect(paused.detail).toContain('support@wagon-wise.co.uk');
  });
});

describe('amountDue', () => {
  it('adds up the issued invoices and nothing else', () => {
    expect(
      amountDue([
        { status: 'issued', totalPence: 1500 },
        { status: 'issued', totalPence: 2500 },
        { status: 'paid', totalPence: 9900 },
        { status: 'draft', totalPence: 700 },
        { status: 'void', totalPence: 300 },
      ]),
    ).toEqual({ pence: 4000, count: 2 });
  });

  it('is nothing when nothing is due', () => {
    expect(amountDue([])).toEqual({ pence: 0, count: 0 });
  });
});

describe('trialPlanText', () => {
  const plan = { capacityToday: 5, pricePerVehiclePence: 1000 };

  it('says it is free now and what it costs afterwards, while on a trial', () => {
    expect(trialPlanText({ status: 'trial', trialEndsOn: '2027-02-22' }, plan)).toEqual({
      headline: 'Room for 5 vehicles. Free during your free period.',
      afterwards:
        'After your free period (it ends on 22 February 2027) you pay £10.00 a month for each vehicle you use: one given a job or checked in a month. A vehicle that sits idle costs nothing.',
    });
  });

  it('copes with one vehicle, no end date, and a plan with no room yet', () => {
    const one = trialPlanText(
      { status: 'trial', trialEndsOn: null },
      { capacityToday: 1, pricePerVehiclePence: 1000 },
    );
    expect(one?.headline).toBe('Room for 1 vehicle. Free during your free period.');
    expect(one?.afterwards).toBe(
      'After your free period you pay £10.00 a month for each vehicle you use: one given a job or checked in a month. A vehicle that sits idle costs nothing.',
    );
    expect(
      trialPlanText(
        { status: 'trial', trialEndsOn: '2027-02-22' },
        { capacityToday: 0, pricePerVehiclePence: 1000 },
      )?.headline,
    ).toBe('Room for 0 vehicles. Free during your free period.');
  });

  it('is for a trial only: any other state keeps the plain monthly amount', () => {
    for (const status of ['active', 'overdue', 'paused'] as const) {
      expect(trialPlanText({ status, trialEndsOn: null }, plan)).toBeUndefined();
    }
  });
});
