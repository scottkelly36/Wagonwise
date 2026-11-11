import {
  enqueueSignature,
  listQueuedSignatureJobIds,
  listQueuedSignatures,
  removeQueuedSignature,
} from './signature-queue';

interface FakeRow {
  job_id: string;
  signer_name: string | null;
  strokes_json: string;
  created_at: string;
}

// "mock"-prefixed so babel-plugin-jest-hoist lets the hoisted jest.mock() factory close over it.
const mockRows: FakeRow[] = [];

// The same stand-in as the photo queue's test: a minimal in-memory version of the expo-sqlite calls this module makes.
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('insert or replace')) {
        const [jobId, signerName, strokesJson, createdAt] = params as [
          string,
          string | null,
          string,
          string,
        ];
        const index = mockRows.findIndex((r) => r.job_id === jobId);
        if (index >= 0) mockRows.splice(index, 1);
        mockRows.push({
          job_id: jobId,
          signer_name: signerName,
          strokes_json: strokesJson,
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

const strokes = [
  [
    [10, 20],
    [300, 200],
  ],
] as [number, number][][];

describe('signature queue', () => {
  it('round-trips a signature with its name, and without one', async () => {
    await enqueueSignature({ jobId: 'job-1', signerName: 'A. Receiver', strokes });
    await enqueueSignature({ jobId: 'job-2', strokes });
    expect(await listQueuedSignatures()).toEqual([
      { jobId: 'job-1', signerName: 'A. Receiver', strokes },
      { jobId: 'job-2', strokes },
    ]);
    expect(await listQueuedSignatureJobIds()).toEqual(['job-1', 'job-2']);
  });

  it('replaces the queued signature when the same job is signed again', async () => {
    await enqueueSignature({ jobId: 'job-1', signerName: 'Old', strokes });
    await enqueueSignature({ jobId: 'job-1', signerName: 'New', strokes });
    expect(await listQueuedSignatures()).toEqual([{ jobId: 'job-1', signerName: 'New', strokes }]);
  });

  it('removes a signature once it has been sent', async () => {
    await enqueueSignature({ jobId: 'job-1', strokes });
    await enqueueSignature({ jobId: 'job-2', strokes });
    await removeQueuedSignature('job-1');
    expect(await listQueuedSignatureJobIds()).toEqual(['job-2']);
  });

  it('drops a row that is damaged on disk rather than sending it', async () => {
    mockRows.push(
      {
        job_id: 'bad-json',
        signer_name: null,
        strokes_json: '{oops',
        created_at: '2026-10-03T10:00:00.000Z',
      },
      {
        job_id: 'bad-shape',
        signer_name: null,
        strokes_json: '[[[5000,5]]]',
        created_at: '2026-10-03T10:00:01.000Z',
      },
    );
    await enqueueSignature({ jobId: 'good', strokes });
    expect((await listQueuedSignatures()).map((s) => s.jobId)).toEqual(['good']);
    expect(await listQueuedSignatureJobIds()).toEqual(['good']);
  });
});
