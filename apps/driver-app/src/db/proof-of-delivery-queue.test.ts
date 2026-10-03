import {
  enqueueProofOfDelivery,
  listQueuedProofJobIds,
  listQueuedProofsOfDelivery,
  removeQueuedProofOfDelivery,
} from './proof-of-delivery-queue';

interface FakeRow {
  job_id: string;
  content_type: string;
  data_base64: string;
  created_at: string;
}

// "mock"-prefixed so babel-plugin-jest-hoist lets the hoisted jest.mock() factory close over it.
const mockRows: FakeRow[] = [];

// Same approach as hazard-queue.test.ts: a minimal in-memory stand-in for the expo-sqlite calls
// this module uses, dispatching on the SQL text — covers this module's own SQL and parsing, not a
// real native database.
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('insert or replace')) {
        const [jobId, contentType, dataBase64, createdAt] = params as [
          string,
          string,
          string,
          string,
        ];
        const index = mockRows.findIndex((r) => r.job_id === jobId);
        if (index >= 0) mockRows.splice(index, 1);
        mockRows.push({
          job_id: jobId,
          content_type: contentType,
          data_base64: dataBase64,
          created_at: createdAt,
        });
      } else if (sql.startsWith('delete')) {
        const [jobId] = params as [string];
        const index = mockRows.findIndex((r) => r.job_id === jobId);
        if (index >= 0) mockRows.splice(index, 1);
      }
      return { changes: 1, lastInsertRowId: 0 };
    }),
    getAllAsync: jest.fn(async (sql: string) => {
      const sorted = [...mockRows].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return sql.startsWith('select job_id from')
        ? sorted.map((r) => ({ job_id: r.job_id }))
        : sorted;
    }),
  })),
}));

beforeEach(() => {
  mockRows.length = 0;
});

const photo = (jobId: string, dataBase64 = 'aGVsbG8=') => ({
  jobId,
  contentType: 'image/jpeg',
  dataBase64,
});

describe('proof of delivery queue', () => {
  it('starts empty', async () => {
    expect(await listQueuedProofsOfDelivery()).toEqual([]);
    expect(await listQueuedProofJobIds()).toEqual([]);
  });

  it('round-trips a photo', async () => {
    await enqueueProofOfDelivery(photo('job-1'));
    expect(await listQueuedProofsOfDelivery()).toEqual([photo('job-1')]);
    expect(await listQueuedProofJobIds()).toEqual(['job-1']);
  });

  it('replaces the queued photo when the same job is retaken', async () => {
    await enqueueProofOfDelivery(photo('job-1', 'b2xk'));
    await enqueueProofOfDelivery(photo('job-1', 'bmV3'));
    expect(await listQueuedProofsOfDelivery()).toEqual([photo('job-1', 'bmV3')]);
  });

  it('removes a photo once it has been sent', async () => {
    await enqueueProofOfDelivery(photo('job-1'));
    await enqueueProofOfDelivery(photo('job-2'));
    await removeQueuedProofOfDelivery('job-1');
    expect(await listQueuedProofJobIds()).toEqual(['job-2']);
  });

  it('fails loudly on a row that is no longer a valid upload', async () => {
    mockRows.push({
      job_id: 'job-1',
      content_type: 'image/jpeg',
      data_base64: 'not base64!!',
      created_at: '2026-10-03T10:00:00.000Z',
    });
    await expect(listQueuedProofsOfDelivery()).rejects.toThrow();
  });
});
