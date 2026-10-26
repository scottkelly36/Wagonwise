import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { err, ok } from '../../../shared/result.js';
import type { WordsProvider } from '../application/words-provider.js';
import { registerWhat3wordsRoutes } from './routes.js';

const address = {
  words: 'filled.count.soap',
  location: { lat: 51.52, lon: -0.2 },
  nearestPlace: 'Bayswater, London',
  country: 'GB',
};

function build(enabled = true) {
  const provider: WordsProvider = {
    enabled,
    toLocation: (words) =>
      Promise.resolve(
        words === 'filled.count.soap' ? ok(address) : err({ tag: 'WordsNotFound' as const }),
      ),
    toWords: () => Promise.resolve(ok(address)),
  };
  const app = Fastify();
  registerWhat3wordsRoutes(app, provider);
  return app;
}

describe('POST /what3words/to-location', () => {
  it('200s the spot for three words typed any usual way', async () => {
    const response = await build().inject({
      method: 'POST',
      url: '/what3words/to-location',
      payload: { words: '///Filled Count Soap' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(address);
  });

  it('400s something that is not three words, 404s a square that does not exist, 503s when the lookup is off', async () => {
    const post = (app: ReturnType<typeof build>, words: string) =>
      app.inject({ method: 'POST', url: '/what3words/to-location', payload: { words } });
    const bad = await post(build(), 'filled.count');
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ tag: 'InvalidWords' });
    expect((await post(build(), 'index.home.raft')).statusCode).toBe(404);
    const off = await post(build(false), 'filled.count.soap');
    expect(off.statusCode).toBe(503);
    expect(off.json()).toMatchObject({ tag: 'LookupUnavailable' });
  });

  it('400s a missing body', async () => {
    const response = await build().inject({
      method: 'POST',
      url: '/what3words/to-location',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /staff/what3words/to-location', () => {
  it('answers the portal the same way: the spot, 400, 404 and 503', async () => {
    const post = (app: ReturnType<typeof build>, words: string) =>
      app.inject({ method: 'POST', url: '/staff/what3words/to-location', payload: { words } });
    const found = await post(build(), 'filled.count.soap');
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(address);
    expect((await post(build(), 'filled.count')).statusCode).toBe(400);
    expect((await post(build(), 'index.home.raft')).statusCode).toBe(404);
    expect((await post(build(false), 'filled.count.soap')).statusCode).toBe(503);
  });
});

describe('POST /what3words/to-words', () => {
  it('200s the words for a position and 503s when the lookup is off', async () => {
    const payload = { location: { lat: 51.52, lon: -0.2 } };
    const ok200 = await build().inject({ method: 'POST', url: '/what3words/to-words', payload });
    expect(ok200.statusCode).toBe(200);
    expect(ok200.json()).toEqual(address);
    const off = await build(false).inject({ method: 'POST', url: '/what3words/to-words', payload });
    expect(off.statusCode).toBe(503);
  });

  it('400s a bad position', async () => {
    const response = await build().inject({
      method: 'POST',
      url: '/what3words/to-words',
      payload: { location: { lat: 200, lon: 0 } },
    });
    expect(response.statusCode).toBe(400);
  });
});
