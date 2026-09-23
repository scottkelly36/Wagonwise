import type { ReportHazardRequest } from '@wagonwise/contracts/hazards';

import {
  enqueueHazardReport,
  listQueuedHazardReports,
  removeQueuedHazardReport,
} from './hazard-queue';

interface FakeRow {
  readonly id: string;
  readonly payload: string;
  readonly created_at: string;
}

// "mock"-prefixed so babel-plugin-jest-hoist allows the jest.mock() factory below (hoisted
// above these imports at runtime) to close over it.
const mockRows: FakeRow[] = [];

// A minimal in-memory stand-in for the three expo-sqlite calls hazard-queue.ts actually uses,
// keyed off the SQL text the same way a real driver would dispatch on it — enough to exercise
// this module's own SQL and parsing logic without a real native database (no native build
// toolchain on this machine, same gap as every other driver-app milestone since M5.1).
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('insert')) {
        const [id, payload, createdAt] = params as [string, string, string];
        mockRows.push({ id, payload, created_at: createdAt });
      } else if (sql.startsWith('delete')) {
        const [id] = params as [string];
        const index = mockRows.findIndex((r) => r.id === id);
        if (index >= 0) mockRows.splice(index, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async () =>
      [...mockRows]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((r) => ({ payload: r.payload })),
    ),
  })),
}));

function request(id: string): ReportHazardRequest {
  return {
    id,
    type: 'low_bridge',
    location: { lat: 54.9707, lon: -2.1013 },
    source: 'tap',
  } as unknown as ReportHazardRequest;
}

beforeEach(() => {
  mockRows.length = 0;
});

describe('hazard queue', () => {
  it('starts empty', async () => {
    expect(await listQueuedHazardReports()).toEqual([]);
  });

  it('round-trips an enqueued report through listQueuedHazardReports', async () => {
    const r = request('11111111-1111-4111-8111-111111111111');
    await enqueueHazardReport(r);
    expect(await listQueuedHazardReports()).toEqual([r]);
  });

  it('lists reports oldest first', async () => {
    await enqueueHazardReport(request('11111111-1111-4111-8111-111111111111'));
    await enqueueHazardReport(request('22222222-2222-4222-8222-222222222222'));
    const listed = await listQueuedHazardReports();
    expect(listed.map((r) => r.id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('removes a report by id, leaving the others', async () => {
    await enqueueHazardReport(request('11111111-1111-4111-8111-111111111111'));
    await enqueueHazardReport(request('22222222-2222-4222-8222-222222222222'));
    await removeQueuedHazardReport('11111111-1111-4111-8111-111111111111');
    const listed = await listQueuedHazardReports();
    expect(listed.map((r) => r.id)).toEqual(['22222222-2222-4222-8222-222222222222']);
  });
});
