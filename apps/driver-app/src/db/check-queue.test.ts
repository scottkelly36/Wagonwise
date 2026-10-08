import { submitCheckRequestSchema } from '@wagonwise/contracts/checks';

import {
  enqueueCheck,
  listQueuedCheckSummaries,
  listQueuedChecks,
  readChecksDue,
  removeQueuedCheck,
  removeQueuedCheckPhoto,
  saveChecksDue,
} from './check-queue';

// "mock"-prefixed so babel-plugin-jest-hoist lets the hoisted jest.mock() factory close over them.
const mockChecks: { check_id: string; request_json: string; created_at: string }[] = [];
const mockPhotos: {
  check_id: string;
  item_id: string;
  content_type: string;
  data_base64: string;
}[] = [];
let mockCache: { json: string } | undefined;

// A minimal in-memory stand-in for the expo-sqlite calls this module uses, dispatching on the SQL text, like
// proof-of-delivery-queue.test.ts: it covers this module's own SQL and parsing, not a real native database.
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runAsync: jest.fn(async (sql: string, ...p: string[]) => {
      if (sql.startsWith('insert or replace into check_photo_queue')) {
        const [check_id, item_id, content_type, data_base64] = p as [
          string,
          string,
          string,
          string,
        ];
        const i = mockPhotos.findIndex((r) => r.check_id === check_id && r.item_id === item_id);
        if (i >= 0) mockPhotos.splice(i, 1);
        mockPhotos.push({ check_id, item_id, content_type, data_base64 });
      } else if (sql.startsWith('insert or replace into check_queue')) {
        const [check_id, request_json, created_at] = p as [string, string, string];
        const i = mockChecks.findIndex((r) => r.check_id === check_id);
        if (i >= 0) mockChecks.splice(i, 1);
        mockChecks.push({ check_id, request_json, created_at });
      } else if (sql.startsWith('insert or replace into check_due_cache')) {
        mockCache = { json: p[0] as string };
      } else if (sql.startsWith('delete from check_photo_queue where check_id = ? and item_id')) {
        const i = mockPhotos.findIndex((r) => r.check_id === p[0] && r.item_id === p[1]);
        if (i >= 0) mockPhotos.splice(i, 1);
      } else if (sql.startsWith('delete from check_photo_queue')) {
        for (let i = mockPhotos.length - 1; i >= 0; i--) {
          if (mockPhotos[i]?.check_id === p[0]) mockPhotos.splice(i, 1);
        }
      } else if (sql.startsWith('delete from check_queue')) {
        const i = mockChecks.findIndex((r) => r.check_id === p[0]);
        if (i >= 0) mockChecks.splice(i, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      if (sql.includes('from check_due_cache')) return mockCache ? [mockCache] : [];
      if (sql.includes('from check_photo_queue')) return [...mockPhotos];
      return [...mockChecks].sort((a, b) => a.created_at.localeCompare(b.created_at));
    }),
  })),
}));

const request = (id: string) =>
  submitCheckRequestSchema.parse({
    id,
    templateId: '44444444-4444-4444-8444-444444444444',
    vehicleId: 'lorry-1',
    answers: [{ itemId: 'tyres', value: 'ok' }],
  });
const photo = (itemId: string) => ({
  itemId,
  contentType: 'image/jpeg' as const,
  dataBase64: 'aGVsbG8=',
});

beforeEach(() => {
  mockChecks.length = 0;
  mockPhotos.length = 0;
  mockCache = undefined;
});

describe('the offline check queue', () => {
  it('keeps a finished check with its photos, oldest first', async () => {
    await enqueueCheck({ request: request('a'), photos: [photo('tyres'), photo('load')] });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await enqueueCheck({ request: request('b'), photos: [] });
    const queued = await listQueuedChecks();
    expect(queued.map((q) => q.request.id)).toEqual(['a', 'b']);
    expect(queued[0]?.photos.map((p) => p.itemId)).toEqual(['tyres', 'load']);
    expect(queued[1]?.photos).toEqual([]);
  });

  it('says which list on which vehicle is waiting, without loading the photos', async () => {
    await enqueueCheck({ request: request('a'), photos: [photo('tyres')] });
    expect(await listQueuedCheckSummaries()).toEqual([
      {
        checkId: 'a',
        templateId: '44444444-4444-4444-8444-444444444444',
        vehicleId: 'lorry-1',
      },
    ]);
  });

  it('removes one photo, or a whole check with its photos', async () => {
    await enqueueCheck({ request: request('a'), photos: [photo('tyres'), photo('load')] });
    await removeQueuedCheckPhoto('a', 'tyres');
    expect((await listQueuedChecks())[0]?.photos.map((p) => p.itemId)).toEqual(['load']);
    await removeQueuedCheck('a');
    expect(await listQueuedChecks()).toEqual([]);
    expect(mockPhotos).toEqual([]);
  });

  it('replaces a check queued twice rather than doubling it', async () => {
    await enqueueCheck({ request: request('a'), photos: [] });
    await enqueueCheck({ request: request('a'), photos: [] });
    expect(await listQueuedChecks()).toHaveLength(1);
  });

  it('remembers the last lists the server gave, so a check can start offline', async () => {
    expect(await readChecksDue()).toBeUndefined();
    await saveChecksDue({ vehicle: { id: 'lorry-1', name: 'Big Wagon' }, lists: [] });
    expect(await readChecksDue()).toEqual({
      vehicle: { id: 'lorry-1', name: 'Big Wagon' },
      lists: [],
    });
  });

  it('treats cached lists it can no longer read as none', async () => {
    mockCache = { json: JSON.stringify({ nonsense: true }) };
    expect(await readChecksDue()).toBeUndefined();
  });
});
