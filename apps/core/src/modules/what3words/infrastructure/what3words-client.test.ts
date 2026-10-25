import { describe, expect, it } from 'vitest';
import { addressFromResponse, What3wordsClient } from './what3words-client.js';

const good = {
  country: 'GB',
  nearestPlace: 'Bayswater, London',
  coordinates: { lng: -0.2, lat: 51.52 },
  words: 'filled.count.soap',
};

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function client(status: number, body: unknown) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const problems: string[] = [];
  const c = new What3wordsClient(
    'secret-key',
    (url, init) => {
      calls.push({ url, headers: init.headers });
      return Promise.resolve(respond(status, body));
    },
    (what) => problems.push(what),
  );
  return { c, calls, problems };
}

describe('What3wordsClient', () => {
  it('turns three words into a position, sending the key in a header and not the address', async () => {
    const { c, calls } = client(200, good);
    expect(await c.toLocation('filled.count.soap')).toEqual({
      ok: true,
      value: {
        words: 'filled.count.soap',
        location: { lat: 51.52, lon: -0.2 },
        nearestPlace: 'Bayswater, London',
        country: 'GB',
      },
    });
    expect(calls[0]?.url).toBe(
      'https://api.what3words.com/v3/convert-to-coordinates?words=filled.count.soap',
    );
    expect(calls[0]?.url).not.toContain('secret-key');
    expect(calls[0]?.headers['X-Api-Key']).toBe('secret-key');
  });

  it('turns a position into three words', async () => {
    const { c, calls } = client(200, good);
    const result = await c.toWords({ lat: 51.52, lon: -0.2 });
    expect(result.ok && result.value.words).toBe('filled.count.soap');
    expect(calls[0]?.url).toBe(
      'https://api.what3words.com/v3/convert-to-3wa?coordinates=51.52,-0.2&language=en',
    );
  });

  it('says a square that does not exist is not found, without reporting a problem', async () => {
    const { c, problems } = client(400, { error: { code: 'BadWords', message: 'x' } });
    expect(await c.toLocation('index.home.raft')).toEqual({
      ok: false,
      error: { tag: 'WordsNotFound' },
    });
    expect(problems).toEqual([]);
  });

  it.each([
    [401, { error: { code: 'InvalidKey' } }],
    [402, { error: { code: 'QuotaExceeded' } }],
    [500, {}],
  ])('is unavailable, and reports it once, when the service answers %i', async (status, body) => {
    const { c, problems } = client(status, body);
    expect(await c.toLocation('filled.count.soap')).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
    expect(problems).toEqual(['what3words refused the request']);
  });

  it('is unavailable when the service cannot be reached or answers nonsense', async () => {
    const down = new What3wordsClient('k', () => Promise.reject(new Error('offline')));
    expect(await down.toLocation('filled.count.soap')).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
    const odd = client(200, { words: 'filled.count.soap' });
    expect(await odd.c.toLocation('filled.count.soap')).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
    expect(odd.problems).toEqual(['what3words answered without an address']);
  });
});

describe('addressFromResponse', () => {
  it('needs the words and a position', () => {
    expect(addressFromResponse(good)?.words).toBe('filled.count.soap');
    expect(addressFromResponse({ ...good, coordinates: {} })).toBeUndefined();
    expect(addressFromResponse(null)).toBeUndefined();
  });
});
