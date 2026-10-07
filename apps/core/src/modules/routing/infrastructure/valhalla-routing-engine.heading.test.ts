import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { ValhallaRoutingEngine } from './valhalla-routing-engine.js';

/**
 * Re-planning in the middle of a drive (field test, 2026-10-07): the route has to set off the way
 * the vehicle is already facing, not ask for a U-turn. A real HTTP round trip against a fake
 * Valhalla we control, like the engine's main test; this one scripts a sequence of answers because
 * the fallback makes two requests.
 */
describe('ValhallaRoutingEngine: the direction the vehicle is heading', () => {
  let server: Server;
  let baseUrl: string;
  let routeBodies: Record<string, unknown>[];
  /** What the fake answers to each /route request, in order; the last one repeats. */
  let routeReplies: { status: number; body: unknown }[];

  const noRoute = { status: 400, body: { error_code: 442, error: 'No path could be found' } };
  const found = {
    status: 200,
    body: { trip: { summary: { time: 475, length: 8 }, legs: [{ shape: 'encoded-shape' }] } },
  };

  beforeEach(async () => {
    routeBodies = [];
    routeReplies = [found];
    server = createServer((request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        if (request.url === '/trace_route') {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error_code: 442, error: 'No path' }));
          return;
        }
        routeBodies.push(body);
        const reply = routeReplies[Math.min(routeBodies.length - 1, routeReplies.length - 1)];
        response.writeHead(reply?.status ?? 500, { 'content-type': 'application/json' });
        response.end(JSON.stringify(reply?.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
  const origin = { lat: 54.9707, lon: -2.1013 };
  const destination = { lat: 54.9738, lon: -2.0165 };
  const locations = (i: number) => routeBodies[i]?.locations as Record<string, unknown>[];

  it('tells Valhalla which way the first road should point', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    await engine.route({ origin, destination, dimensions, avoid: [], originHeadingDeg: 123.6 });

    expect(locations(0)[0]).toMatchObject({ lat: origin.lat, lon: origin.lon, heading: 124 });
    expect(locations(0)[0]?.heading_tolerance).toBe(60);
    // Only the start has a heading: the destination is a place, not a direction of travel.
    expect(locations(0)[1]).toEqual({ lat: destination.lat, lon: destination.lon });
  });

  it('sends no heading when the driver is not moving', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    await engine.route({ origin, destination, dimensions, avoid: [] });
    expect(locations(0)[0]).toEqual({ lat: origin.lat, lon: origin.lon });
  });

  it('keeps the heading on each alternative request too', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    await engine.routeAlternatives({
      origin,
      destination,
      dimensions,
      avoid: [],
      originHeadingDeg: 90,
    });
    expect(locations(0)[0]).toMatchObject({ heading: 90 });
  });

  it('asks again without the heading when no route sets off that way, rather than failing', async () => {
    routeReplies = [noRoute, found];
    const engine = new ValhallaRoutingEngine(baseUrl);
    const result = await engine.route({
      origin,
      destination,
      dimensions,
      avoid: [],
      originHeadingDeg: 270,
    });

    expect(result.ok).toBe(true);
    expect(routeBodies).toHaveLength(2);
    expect(locations(0)[0]).toMatchObject({ heading: 270 });
    expect(locations(1)[0]).toEqual({ lat: origin.lat, lon: origin.lon });
  });

  it('still reports no route when there is none even without a heading', async () => {
    routeReplies = [noRoute];
    const engine = new ValhallaRoutingEngine(baseUrl);
    const result = await engine.route({
      origin,
      destination,
      dimensions,
      avoid: [],
      originHeadingDeg: 270,
    });
    expect(result).toEqual({ ok: false, error: { tag: 'NoRouteFound' } });
    expect(routeBodies).toHaveLength(2);
  });
});
