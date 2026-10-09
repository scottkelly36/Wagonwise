import { describe, expect, it } from 'vitest';
import {
  firmsActiveThisWeek,
  getUsage,
  type UsageFirm,
  type UsageReader,
  type UsageReport,
} from './usage.js';

const now = new Date('2026-10-09T12:00:00.000Z');
const none = { total: 0, neverSignedIn: 0, active24h: 0, active7d: 0, active30d: 0 };
const report: UsageReport = {
  generatedAt: now,
  drivers: none,
  staff: none,
  devices: 0,
  tripsRunningNow: 0,
  tripsPerDay: [],
  jobsCreatedPerWeek: [],
  jobsDeliveredPerWeek: [],
  checksPerWeek: [],
  testers: 0,
  firms: [],
};
const reader: UsageReader = { read: () => Promise.resolve(report) };
const deps = { reader, clock: { now: () => now } };

const firm = (lastActiveAt: Date | null): UsageFirm => ({
  id: 'f',
  name: 'F',
  drivers: 0,
  vehicles: 0,
  staff: 0,
  jobsThisMonth: 0,
  lastActiveAt,
});

describe('getUsage', () => {
  it('gives the report to WagonWise staff', async () => {
    const result = await getUsage(deps, { kind: 'platform' });
    expect(result).toEqual({ ok: true, value: report });
  });

  it('refuses a company', async () => {
    const result = await getUsage(deps, { kind: 'fleet', companyId: 'c', privileges: [] });
    expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
  });
});

describe('firmsActiveThisWeek', () => {
  it('counts firms used in the last seven days, not the idle or the never-used', () => {
    const firms = [
      firm(new Date('2026-10-08T09:00:00.000Z')),
      firm(new Date('2026-10-02T11:59:00.000Z')),
      firm(new Date('2026-10-02T12:01:00.000Z')),
      firm(null),
    ];
    expect(firmsActiveThisWeek(firms, now)).toBe(2);
  });
});
