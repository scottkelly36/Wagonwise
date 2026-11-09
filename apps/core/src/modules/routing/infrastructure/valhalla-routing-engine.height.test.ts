import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encodePolyline } from '../application/testing/encode-polyline.js';
import { ValhallaRoutingEngine } from './valhalla-routing-engine.js';

const geometry = encodePolyline([
  { lat: 54.9, lon: -1.5 },
  { lat: 54.91, lon: -1.49 },
  { lat: 54.92, lon: -1.48 },
]);

/** The height service of a real local HTTP server standing in for Valhalla, as the other tests of the adapter do. */
describe('ValhallaRoutingEngine.elevationProfile', () => {
  let server: Server;
  let baseUrl: string;
  let reply: { status: number; body: unknown };
  let received: Record<string, unknown> | undefined;
  let url: string | undefined;

  beforeEach(async () => {
    reply = { status: 200, body: { range_height: [] } };
    received = undefined;
    url = undefined;
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        url = request.url;
        received = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        response.writeHead(reply.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('asks for heights along the route every 100 m, and returns distance and height pairs', async () => {
    reply.body = {
      range_height: [
        [0, 20],
        [100, 24.5],
        [200, 31],
      ],
    };
    const profile = await new ValhallaRoutingEngine(baseUrl).elevationProfile(geometry);

    expect(url).toBe('/height');
    expect(received).toMatchObject({ range: true, resample_distance: 100 });
    expect((received!.shape as { lat: number; lon: number }[])[0]).toEqual({
      lat: 54.9,
      lon: -1.5,
    });
    expect(profile).toEqual([
      { distanceM: 0, heightM: 20 },
      { distanceM: 100, heightM: 24.5 },
      { distanceM: 200, heightM: 31 },
    ]);
  });

  it('leaves out a place with no height data', async () => {
    reply.body = {
      range_height: [
        [0, 20],
        [100, null],
        [200, 31],
      ],
    };
    expect(await new ValhallaRoutingEngine(baseUrl).elevationProfile(geometry)).toEqual([
      { distanceM: 0, heightM: 20 },
      { distanceM: 200, heightM: 31 },
    ]);
  });

  it('is undefined, not an error, when the service refuses (no elevation files set up)', async () => {
    reply = { status: 400, body: { error_code: 170, error: 'Elevation is not enabled' } };
    expect(await new ValhallaRoutingEngine(baseUrl).elevationProfile(geometry)).toBeUndefined();
  });

  it('is undefined when there is nothing usable in the answer', async () => {
    reply.body = { range_height: [[0, null]] };
    expect(await new ValhallaRoutingEngine(baseUrl).elevationProfile(geometry)).toBeUndefined();
    reply.body = { something: 'else' };
    expect(await new ValhallaRoutingEngine(baseUrl).elevationProfile(geometry)).toBeUndefined();
  });

  it('is undefined when the service cannot be reached', async () => {
    const engine = new ValhallaRoutingEngine('http://127.0.0.1:1');
    expect(await engine.elevationProfile(geometry)).toBeUndefined();
  });
});
