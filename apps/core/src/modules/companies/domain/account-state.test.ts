import { describe, expect, it } from 'vitest';
import {
  isOpenWhenPaused,
  isPaused,
  OPEN_WHEN_PAUSED,
  refusesStaffRequest,
  trialEndsOn,
  ukDay,
} from './account-state.js';

describe('trialEndsOn', () => {
  it('is the given number of days after the start day', () => {
    expect(trialEndsOn('2026-11-22', 90)).toBe('2027-02-20');
    expect(trialEndsOn('2026-11-22', 30)).toBe('2026-12-22');
  });

  it('crosses month, year and leap-day ends', () => {
    expect(trialEndsOn('2026-12-31', 1)).toBe('2027-01-01');
    expect(trialEndsOn('2028-02-28', 1)).toBe('2028-02-29');
    expect(trialEndsOn('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('is not moved by the clocks changing', () => {
    // The UK clocks go forward on 2027-03-28; a 7 day trial from 2027-03-25 still ends on the 1st.
    expect(trialEndsOn('2027-03-25', 7)).toBe('2027-04-01');
  });
});

describe('ukDay', () => {
  it('gives the UK day, not the UTC one, either side of midnight', () => {
    expect(ukDay(new Date('2026-07-01T23:30:00.000Z'))).toBe('2026-07-02');
    expect(ukDay(new Date('2026-12-01T23:30:00.000Z'))).toBe('2026-12-01');
  });
});

describe('isPaused', () => {
  it('is true only for a paused company', () => {
    expect(isPaused('paused')).toBe(true);
    expect(isPaused('trial')).toBe(false);
    expect(isPaused('active')).toBe(false);
    expect(isPaused('overdue')).toBe(false);
  });
});

describe('refusesStaffRequest', () => {
  it('lets everything through unless the company is paused', () => {
    for (const status of ['trial', 'active', 'overdue'] as const) {
      expect(refusesStaffRequest(status, 'POST', '/staff/jobs/companies/c1/jobs')).toBe(false);
      expect(refusesStaffRequest(status, 'DELETE', '/staff/fleet/vehicles/v1')).toBe(false);
    }
  });

  it('refuses a paused company every request that changes something', () => {
    expect(refusesStaffRequest('paused', 'POST', '/staff/jobs/companies/c1/jobs')).toBe(true);
    expect(refusesStaffRequest('paused', 'PUT', '/staff/fleet/vehicles/v1')).toBe(true);
    expect(refusesStaffRequest('paused', 'DELETE', '/staff/fleet/vehicles/v1')).toBe(true);
    expect(refusesStaffRequest('paused', 'POST', '/staff/invites')).toBe(true);
    expect(refusesStaffRequest('paused', 'PUT', '/staff/members/s1/privileges')).toBe(true);
    // A lookup that costs money is a POST and is refused too, however read-like it is.
    expect(refusesStaffRequest('paused', 'POST', '/staff/maintenance/vehicles/v1/lookup')).toBe(
      true,
    );
  });

  it('lets a paused company read, whatever the path', () => {
    expect(refusesStaffRequest('paused', 'GET', '/staff/jobs/companies/c1/jobs')).toBe(false);
    expect(refusesStaffRequest('paused', 'HEAD', '/staff/fleet/vehicles')).toBe(false);
    expect(refusesStaffRequest('paused', 'OPTIONS', '/staff/fleet/vehicles')).toBe(false);
    expect(refusesStaffRequest('paused', 'get', '/staff/audit/vehicles/v1')).toBe(false);
  });

  it('lets a paused company remove a person and resolve a safety alert', () => {
    expect(refusesStaffRequest('paused', 'DELETE', '/staff/members/s1')).toBe(false);
    expect(refusesStaffRequest('paused', 'POST', '/staff/sos/a1/resolve')).toBe(false);
  });

  it('does not let those two through on other paths or methods', () => {
    expect(refusesStaffRequest('paused', 'PUT', '/staff/members/s1')).toBe(true);
    expect(refusesStaffRequest('paused', 'DELETE', '/staff/members/s1/privileges')).toBe(true);
    expect(refusesStaffRequest('paused', 'POST', '/staff/sos/a1/resolve/extra')).toBe(true);
    expect(refusesStaffRequest('paused', 'DELETE', '/staff/sos/a1/resolve')).toBe(true);
  });
});

describe('isOpenWhenPaused', () => {
  it('agrees with the list it is built from', () => {
    expect(OPEN_WHEN_PAUSED.length).toBeGreaterThan(0);
    expect(isOpenWhenPaused('DELETE', '/staff/members/abc')).toBe(true);
    expect(isOpenWhenPaused('POST', '/staff/fleet/companies/c1/vehicles')).toBe(false);
  });
});
