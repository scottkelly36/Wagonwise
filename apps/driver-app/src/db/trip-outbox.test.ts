import { enqueueTripEnd, listPendingTripEnds, removePendingTripEnd } from './trip-outbox';

interface FakeRow {
  trip_id: string;
  job_id: string | null;
  job_status: string | null;
  queued_at: string;
  ended_at: string | null;
}

// "mock"-prefixed so babel-plugin-jest-hoist lets the hoisted jest.mock() factory close over it.
const mockRows: FakeRow[] = [];

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('insert or replace')) {
        const [tripId, jobId, jobStatus, queuedAt, endedAt] = params as [
          string,
          string | null,
          string | null,
          string,
          string | null,
        ];
        const index = mockRows.findIndex((r) => r.trip_id === tripId);
        if (index >= 0) mockRows.splice(index, 1);
        mockRows.push({
          trip_id: tripId,
          job_id: jobId,
          job_status: jobStatus,
          queued_at: queuedAt,
          ended_at: endedAt,
        });
      } else if (sql.startsWith('delete')) {
        const [tripId] = params as [string];
        const index = mockRows.findIndex((r) => r.trip_id === tripId);
        if (index >= 0) mockRows.splice(index, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async () =>
      [...mockRows].sort((a, b) => a.queued_at.localeCompare(b.queued_at)),
    ),
  })),
}));

beforeEach(() => {
  mockRows.length = 0;
});

describe('the trip outbox', () => {
  it('round-trips a plain end and an arrival with its end, in the order they were queued', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-12T09:00:00.000Z') });
    await enqueueTripEnd({ tripId: 'trip-1' });
    jest.setSystemTime(new Date('2026-11-12T09:05:00.000Z'));
    await enqueueTripEnd({
      tripId: 'trip-2',
      jobAdvance: { jobId: 'job-1', status: 'at_delivery' },
    });
    jest.useRealTimers();

    expect(await listPendingTripEnds()).toEqual([
      { tripId: 'trip-1' },
      { tripId: 'trip-2', jobAdvance: { jobId: 'job-1', status: 'at_delivery' } },
    ]);
  });

  it('keeps when the driver tapped, so the server can record the trip as ending then', async () => {
    await enqueueTripEnd({ tripId: 'trip-1', endedAt: '2026-11-12T09:30:00.000Z' });
    await enqueueTripEnd({
      tripId: 'trip-2',
      endedAt: '2026-11-12T09:31:00.000Z',
      jobAdvance: { jobId: 'job-1', status: 'at_delivery' },
    });
    expect(await listPendingTripEnds()).toEqual([
      { tripId: 'trip-1', endedAt: '2026-11-12T09:30:00.000Z' },
      {
        tripId: 'trip-2',
        endedAt: '2026-11-12T09:31:00.000Z',
        jobAdvance: { jobId: 'job-1', status: 'at_delivery' },
      },
    ]);
  });

  it('keeps one end per trip, the latest', async () => {
    await enqueueTripEnd({ tripId: 'trip-1' });
    await enqueueTripEnd({ tripId: 'trip-1', jobAdvance: { jobId: 'job-1', status: 'at_pickup' } });
    expect(await listPendingTripEnds()).toEqual([
      { tripId: 'trip-1', jobAdvance: { jobId: 'job-1', status: 'at_pickup' } },
    ]);
  });

  it('removes one, and keeps the trip ending when its status is no longer one the app knows', async () => {
    mockRows.push({
      trip_id: 'trip-9',
      job_id: 'job-9',
      job_status: 'teleported',
      queued_at: '2026-11-12T09:00:00.000Z',
      ended_at: null,
    });
    await enqueueTripEnd({ tripId: 'trip-1' });
    expect(await listPendingTripEnds()).toContainEqual({ tripId: 'trip-9' });
    await removePendingTripEnd('trip-1');
    expect((await listPendingTripEnds()).map((i) => i.tripId)).toEqual(['trip-9']);
  });
});
