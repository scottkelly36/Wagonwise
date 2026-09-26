import { congestionReportIdSchema } from '@wagonwise/contracts/congestion';

import { findNearbyCongestion, reportCongestion } from './congestion';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const report = {
  id: '11111111-1111-1111-1111-111111111111',
  reporterId: '22222222-2222-2222-2222-222222222222',
  location: { lat: 54.9707, lon: -2.1013 },
  estimatedWaitMinutes: 15,
  createdAt: '2026-06-15T08:00:00.000Z',
  expiresAt: '2026-06-15T08:15:00.000Z',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reportCongestion', () => {
  it('posts the id/location/estimatedWaitMinutes, parsing the 200 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, report));
    globalThis.fetch = fetchMock;

    const result = await reportCongestion('token-1', {
      id: congestionReportIdSchema.parse(report.id),
      location: report.location,
      estimatedWaitMinutes: 15,
    });

    expect(result).toEqual(report);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/congestion\/reports$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({
      id: report.id,
      location: report.location,
      estimatedWaitMinutes: 15,
    });
  });

  it('throws an ApiError when the server rejects the request with a 400', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        tag: 'InvalidEstimatedWait',
        reason: 'out_of_range',
        requestId: 'r1',
      }),
    );

    await expect(
      reportCongestion('token-1', {
        id: congestionReportIdSchema.parse(report.id),
        location: report.location,
        estimatedWaitMinutes: 15,
      }),
    ).rejects.toMatchObject({ tag: 'InvalidEstimatedWait', status: 400 });
  });
});

describe('findNearbyCongestion', () => {
  it('posts the corridor and radius, parsing the reports array out of the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { reports: [report] }));
    globalThis.fetch = fetchMock;

    const result = await findNearbyCongestion('token-1', {
      corridor: [report.location],
      radiusM: 5000,
    });

    expect(result).toEqual([report]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/congestion\/reports\/nearby$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({
      corridor: [report.location],
      radiusM: 5000,
    });
  });

  it('throws an ApiError on a non-200 response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_request' }));

    await expect(
      findNearbyCongestion('token-1', { corridor: [report.location], radiusM: 5000 }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
