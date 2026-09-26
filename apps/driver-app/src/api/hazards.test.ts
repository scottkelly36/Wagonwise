import { hazardReportIdSchema } from '@wagonwise/contracts/hazards';

import {
  confirmHazard,
  deleteHazard,
  dismissHazard,
  findNearbyHazards,
  getHazard,
  parseVoiceHazardReport,
  reportHazard,
} from './hazards';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function noBodyResponse(status: number): Response {
  return {
    status,
    headers: { get: (name: string) => (name === 'content-length' ? '0' : null) },
    json: () => Promise.reject(new Error('should not be called')),
  } as unknown as Response;
}

const report = {
  id: '11111111-1111-1111-1111-111111111111',
  reporterId: '22222222-2222-2222-2222-222222222222',
  type: 'low_bridge',
  location: { lat: 54.9707, lon: -2.1013 },
  source: 'tap',
  confirmations: 0,
  dismissals: 0,
  status: 'active',
  createdAt: '2026-06-15T08:00:00.000Z',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('reportHazard', () => {
  it('posts the id/type/location/source, parsing the 200 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, report));
    globalThis.fetch = fetchMock;

    const result = await reportHazard('token-1', {
      id: hazardReportIdSchema.parse(report.id),
      type: 'low_bridge',
      location: report.location,
      source: 'tap',
    });

    expect(result).toEqual(report);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/hazards\/reports$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({
      id: report.id,
      type: 'low_bridge',
      location: report.location,
      source: 'tap',
    });
  });

  it('throws an ApiError when the server rejects the request with a 400', async () => {
    // The request body itself is well-formed (zod's own .positive() check would reject a
    // genuinely invalid measurement client-side before any fetch, same as
    // createVehicleProfile's own "invalid dimensions" test) — this exercises the server-error
    // handling path, not client-side validation.
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        tag: 'InvalidMeasurement',
        reason: 'must_be_positive',
        requestId: 'r1',
      }),
    );

    await expect(
      reportHazard('token-1', {
        id: hazardReportIdSchema.parse(report.id),
        type: 'low_bridge',
        location: report.location,
        measurement: { kind: 'height', value: 3.5, unit: 'm' },
        source: 'tap',
      }),
    ).rejects.toMatchObject({ tag: 'InvalidMeasurement', status: 400 });
  });
});

describe('getHazard', () => {
  it('requests the specific id and parses the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, report));
    globalThis.fetch = fetchMock;

    const result = await getHazard('token-1', report.id);

    expect(result).toEqual(report);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(new RegExp(`/hazards/reports/${report.id}$`));
  });

  it('throws an ApiError on a 404', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, { tag: 'HazardReportNotFound', requestId: 'r1' }));

    await expect(getHazard('token-1', report.id)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('confirmHazard', () => {
  it('posts to the confirm endpoint with no body, parsing the response', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { ...report, confirmations: 1 }));
    globalThis.fetch = fetchMock;

    const result = await confirmHazard('token-1', report.id);

    expect(result.confirmations).toBe(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(new RegExp(`/hazards/reports/${report.id}/confirm$`));
  });
});

describe('parseVoiceHazardReport', () => {
  it('posts the transcript, parsing the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { type: 'low_bridge' }));
    globalThis.fetch = fetchMock;

    const result = await parseVoiceHazardReport('token-1', 'low bridge ahead');

    expect(result).toEqual({ type: 'low_bridge' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/hazards\/voice-reports\/parse$/);
    expect(JSON.parse(init.body as string)).toEqual({ transcript: 'low bridge ahead' });
  });

  it('throws an ApiError on a non-200 response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'unauthenticated' }));

    await expect(parseVoiceHazardReport('token-1', 'low bridge ahead')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('dismissHazard', () => {
  it('posts to the dismiss endpoint with no body, parsing the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ...report, dismissals: 1 }));
    globalThis.fetch = fetchMock;

    const result = await dismissHazard('token-1', report.id);

    expect(result.dismissals).toBe(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(new RegExp(`/hazards/reports/${report.id}/dismiss$`));
  });
});

describe('deleteHazard', () => {
  it('sends a DELETE and resolves on a 204 with no body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(noBodyResponse(204));
    globalThis.fetch = fetchMock;

    await expect(deleteHazard('token-1', report.id)).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/hazards/reports/${report.id}$`));
    expect(init.method).toBe('DELETE');
  });

  it('throws an ApiError with tag Forbidden on a 403', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(403, { tag: 'Forbidden', requestId: 'r1' }));

    await expect(deleteHazard('token-1', report.id)).rejects.toMatchObject({
      tag: 'Forbidden',
      status: 403,
    });
  });
});

describe('findNearbyHazards', () => {
  it('posts the corridor and radius, parsing the hazards array out of the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { hazards: [report] }));
    globalThis.fetch = fetchMock;

    const result = await findNearbyHazards('token-1', {
      corridor: [report.location],
      radiusM: 5000,
    });

    expect(result).toEqual([report]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/hazards\/reports\/nearby$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({
      corridor: [report.location],
      radiusM: 5000,
    });
  });

  it('throws an ApiError on a non-200 response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(400, { error: 'invalid_request' }));

    await expect(
      findNearbyHazards('token-1', { corridor: [report.location], radiusM: 5000 }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
