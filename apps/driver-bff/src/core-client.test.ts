import { describe, expect, it, vi } from 'vitest';
import { createCoreClient } from './core-client.js';

function fakeFetch(response: { status: number; body?: unknown }) {
  const headers = new Headers();
  const bodyText = response.body === undefined ? '' : JSON.stringify(response.body);
  headers.set('content-length', bodyText ? String(bodyText.length) : '0');

  return vi.fn<typeof fetch>((_url, _init) =>
    Promise.resolve(new Response(bodyText || null, { status: response.status, headers })),
  );
}

describe('createCoreClient', () => {
  it('POSTs JSON with the internal key and request id headers', async () => {
    const fetchFn = fakeFetch({ status: 200, body: { ok: true } });
    const client = createCoreClient('http://127.0.0.1:3001', 'the-internal-key', fetchFn);

    await client.post('/identity/otp/request', { identifier: 'a@example.com' }, 'req-1');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:3001/identity/otp/request');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-internal-key']).toBe('the-internal-key');
    expect(headers['x-request-id']).toBe('req-1');
    expect(headers['content-type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ identifier: 'a@example.com' }));
  });

  it('relays the status and parsed body back unchanged', async () => {
    const fetchFn = fakeFetch({ status: 401, body: { tag: 'OtpIncorrect', attemptsRemaining: 4 } });
    const client = createCoreClient('http://127.0.0.1:3001', 'key', fetchFn);

    const result = await client.post('/identity/otp/verify', { code: '000000' }, 'req-2');

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ tag: 'OtpIncorrect', attemptsRemaining: 4 });
  });

  it('sends no body or content-type when the payload is undefined', async () => {
    const fetchFn = fakeFetch({ status: 204 });
    const client = createCoreClient('http://127.0.0.1:3001', 'key', fetchFn);

    await client.post('/identity/sessions/s1/revoke', undefined, 'req-3');

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('treats a 204 as having no body', async () => {
    const fetchFn = fakeFetch({ status: 204 });
    const client = createCoreClient('http://127.0.0.1:3001', 'key', fetchFn);

    const result = await client.post('/identity/sessions/s1/revoke', undefined, 'req-4');
    expect(result).toEqual({ status: 204, body: undefined });
  });
});
