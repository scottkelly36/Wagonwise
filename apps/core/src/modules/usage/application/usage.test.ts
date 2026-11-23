import { describe, expect, it } from 'vitest';
import { getUsageSection, USAGE_SECTIONS, type UsageReader, type UsageSection } from './usage.js';

const now = new Date('2026-10-09T12:00:00.000Z');
const none = { total: 0, neverSignedIn: 0, active24h: 0, active7d: 0, active30d: 0 };

/** Counts which sections were asked for, so a test can show that one view reads only its own. */
function recordingReader(asked: UsageSection[]): UsageReader {
  return {
    overview: () => {
      asked.push('overview');
      return Promise.resolve({
        generatedAt: now,
        drivers: none,
        deletedDrivers: 0,
        staff: none,
        devices: 0,
        testers: 0,
        tripsRunningNow: 0,
        tripsToday: 0,
        firms: { total: 0, activeThisWeek: 0 },
        funnel: {
          accounts: 0,
          signedIn: 0,
          hasVehicle: 0,
          plannedRoute: 0,
          startedTrip: 0,
          startedTripOnTwoDays: 0,
        },
      });
    },
    drivers: () => {
      asked.push('drivers');
      return Promise.resolve({ generatedAt: now, newDriversByDay: [], retentionByWeek: [] });
    },
    activity: () => {
      asked.push('activity');
      return Promise.resolve({
        generatedAt: now,
        tripsPerDay: [],
        jobsCreatedPerWeek: [],
        jobsDeliveredPerWeek: [],
        checksPerWeek: [],
      });
    },
    firms: () => {
      asked.push('firms');
      return Promise.resolve({ generatedAt: now, firms: [] });
    },
    flows: () => {
      asked.push('flows');
      return Promise.resolve({
        windowDays: 7,
        sessions: 0,
        events: 0,
        steps: [],
        byVersion: [],
        medianSeconds: { planToPress: null, routeToStart: null },
        choices: [],
        walkthrough: { started: 0, finished: 0, skipped: 0 },
        remindersOpened: 0,
        referralOpened: 0,
        referralShared: 0,
      });
    },
    site: () => {
      asked.push('site');
      return Promise.resolve({
        windowDays: 7,
        views: [],
        videoPlays: 0,
        sources: [],
        campaigns: [],
      });
    },
  };
}

describe('getUsageSection', () => {
  it('gives each section to WagonWise staff, reading only that section', async () => {
    for (const section of USAGE_SECTIONS) {
      const asked: UsageSection[] = [];
      const deps = { reader: recordingReader(asked), clock: { now: () => now } };
      const result = await getUsageSection(deps, { kind: 'platform' }, section);
      expect(result.ok).toBe(true);
      expect(asked).toEqual([section]);
    }
  });

  it('refuses a company, and reads nothing', async () => {
    const asked: UsageSection[] = [];
    const deps = { reader: recordingReader(asked), clock: { now: () => now } };
    const result = await getUsageSection(
      deps,
      { kind: 'fleet', companyId: 'c', privileges: [] },
      'overview',
    );
    expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    expect(asked).toEqual([]);
  });
});
