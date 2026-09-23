import { submitFeedback } from './feedback';
import { ApiError } from './errors';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const note = {
  id: '11111111-1111-1111-1111-111111111111',
  driverId: '22222222-2222-2222-2222-222222222222',
  message: 'The route to Corbridge avoided a bridge that was fine.',
  appVersion: '1.0.0',
  deviceInfo: 'ios 17.2',
  createdAt: '2026-06-15T08:00:00.000Z',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('submitFeedback', () => {
  it('posts the message/appVersion/deviceInfo, parsing the 201 response', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(201, note));
    globalThis.fetch = fetchMock;

    const result = await submitFeedback('token-1', {
      message: note.message,
      appVersion: note.appVersion,
      deviceInfo: note.deviceInfo,
    });

    expect(result).toEqual(note);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/feedback\/notes$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body as string)).toEqual({
      message: note.message,
      appVersion: note.appVersion,
      deviceInfo: note.deviceInfo,
    });
  });

  it('throws an ApiError with a 400 on a blank message', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(400, { tag: 'InvalidMessage', requestId: 'r1' }));

    await expect(
      submitFeedback('token-1', { message: 'x', appVersion: '1.0.0', deviceInfo: 'ios 17.2' }),
    ).rejects.toMatchObject({ tag: 'InvalidMessage', status: 400 });
  });

  it('throws an ApiError instance on any failure response', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, { tag: 'UnknownError', requestId: 'r1' }));

    await expect(
      submitFeedback('token-1', { message: 'x', appVersion: '1.0.0', deviceInfo: 'ios 17.2' }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
