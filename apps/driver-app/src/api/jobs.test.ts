import { advanceJobStatus, attachProofOfDelivery, getCurrentJob } from './jobs';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const job = {
  id: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222',
  reference: 'JOB-1',
  stops: [
    { kind: 'pickup' as const, name: 'Hexham depot', location: { lat: 54.97, lon: -2.1 } },
    { kind: 'delivery' as const, name: 'Newcastle port', location: { lat: 54.97, lon: -1.6 } },
  ],
  status: 'assigned' as const,
  timeline: [{ status: 'assigned' as const, at: '2026-10-02T09:00:00.000Z' }],
  requiresProofOfDelivery: false,
  hasProofOfDelivery: false,
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getCurrentJob', () => {
  it('sends the bearer token and parses the job', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { job }));
    globalThis.fetch = fetchMock;

    const result = await getCurrentJob('token-1');

    expect(result).toEqual(job);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/jobs\/current$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });

  it('parses null when there is no active job', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { job: null }));
    expect(await getCurrentJob('token-1')).toBeNull();
  });
});

describe('advanceJobStatus', () => {
  it('posts the next status and parses the updated job', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { ...job, status: 'accepted' }));
    globalThis.fetch = fetchMock;

    const result = await advanceJobStatus('token-1', job.id, { status: 'accepted' });

    expect(result.status).toBe('accepted');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/jobs/${job.id}/status$`));
    expect(JSON.parse(init.body as string)).toEqual({ status: 'accepted' });
  });

  it('throws an ApiError on a step the job cannot take from here', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(409, {
        tag: 'InvalidTransition',
        from: 'assigned',
        to: 'loaded',
        requestId: 'r1',
      }),
    );

    await expect(advanceJobStatus('token-1', job.id, { status: 'loaded' })).rejects.toMatchObject({
      tag: 'InvalidTransition',
      status: 409,
    });
    await expect(advanceJobStatus('token-1', job.id, { status: 'loaded' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('attachProofOfDelivery', () => {
  const photo = { contentType: 'image/jpeg', dataBase64: 'aGVsbG8=' };

  it('posts the photo as base64 JSON with the bearer token and accepts the 204', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(204, undefined));
    globalThis.fetch = fetchMock;

    await expect(attachProofOfDelivery('token-1', job.id, photo)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/jobs/${job.id}/proof-of-delivery$`));
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual(photo);
  });

  it('throws an ApiError when the job is not there', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { tag: 'JobNotFound', requestId: 'r1' }));

    await expect(attachProofOfDelivery('token-1', job.id, photo)).rejects.toMatchObject({
      tag: 'JobNotFound',
      status: 404,
    });
  });
});
