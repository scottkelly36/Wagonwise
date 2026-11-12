import type { ActiveTripDto, RoutePlanDto } from '@wagonwise/contracts/routing';

import { clearSavedTrip, loadSavedTrip, saveTrip } from './saved-trip';

interface FakeRow {
  trip_json: string;
  plan_json: string;
  saved_at: string;
}

// "mock"-prefixed so babel-plugin-jest-hoist lets the hoisted jest.mock() factory close over it.
let mockRow: FakeRow | undefined;

// A minimal in-memory version of the expo-sqlite calls this module makes, as for the other queues' tests.
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('insert or replace')) {
        const [tripJson, planJson, savedAt] = params as [string, string, string];
        mockRow = { trip_json: tripJson, plan_json: planJson, saved_at: savedAt };
      } else if (sql.startsWith('delete')) {
        mockRow = undefined;
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async () => (mockRow === undefined ? [] : [mockRow])),
  })),
}));

beforeEach(() => {
  mockRow = undefined;
});

const trip = {
  id: '11111111-1111-4111-8111-111111111111',
  routePlanId: '22222222-2222-4222-8222-222222222222',
  driverId: '33333333-3333-4333-8333-333333333333',
  startedAt: '2026-11-12T09:00:00.000Z',
} as ActiveTripDto;

const plan = {
  id: '22222222-2222-4222-8222-222222222222',
  driverId: '33333333-3333-4333-8333-333333333333',
  profileId: '44444444-4444-4444-8444-444444444444',
  origin: { lat: 55, lon: -2 },
  destination: { lat: 56, lon: -3 },
  geometry: 'abc',
  distanceKm: 120,
  durationMin: 90,
  avoidedRestrictions: [],
  maneuvers: [],
  hazardsOnRoute: [],
  createdAt: '2026-11-12T08:59:00.000Z',
} as unknown as RoutePlanDto;

describe('the saved trip', () => {
  it('round-trips the trip and its plan, with when it was saved', async () => {
    await saveTrip(trip, plan, new Date('2026-11-12T09:01:00.000Z'));
    const saved = await loadSavedTrip();
    expect(saved?.trip).toEqual(trip);
    expect(saved?.plan.id).toBe(plan.id);
    expect(saved?.savedAt).toBe('2026-11-12T09:01:00.000Z');
  });

  it('keeps one trip: saving again replaces it', async () => {
    await saveTrip(trip, plan);
    await saveTrip({ ...trip, id: '55555555-5555-4555-8555-555555555555' } as ActiveTripDto, plan);
    expect((await loadSavedTrip())?.trip.id).toBe('55555555-5555-4555-8555-555555555555');
  });

  it('has nothing when nothing was saved, and after it is cleared', async () => {
    expect(await loadSavedTrip()).toBeUndefined();
    await saveTrip(trip, plan);
    await clearSavedTrip();
    expect(await loadSavedTrip()).toBeUndefined();
  });

  it('drops a row damaged on disk instead of trusting it', async () => {
    mockRow = { trip_json: '{not json', plan_json: '{}', saved_at: '2026-11-12T09:00:00.000Z' };
    expect(await loadSavedTrip()).toBeUndefined();
    expect(mockRow).toBeUndefined();
  });

  it('drops a row whose shape is no longer the one the app reads', async () => {
    mockRow = {
      trip_json: JSON.stringify({ id: 'x' }),
      plan_json: JSON.stringify({}),
      saved_at: '2026-11-12T09:00:00.000Z',
    };
    expect(await loadSavedTrip()).toBeUndefined();
  });
});
