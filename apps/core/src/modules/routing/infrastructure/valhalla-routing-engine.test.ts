import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { ValhallaRoutingEngine } from './valhalla-routing-engine.js';

interface ReceivedRequest {
  readonly body: Record<string, unknown>;
  respond(body: unknown, status: number): void;
}

/**
 * A real local HTTP server standing in for Valhalla — same philosophy as the driver-bff's
 * access-token-verifier test: a genuine HTTP round trip against a fake we control, not a mocked
 * `fetch`. Valhalla itself (real tiles, real truck costing) is verified separately, by hand,
 * against the M2.1 instance — decision 13 keeps it out of the per-PR/unit test tier.
 */
describe('ValhallaRoutingEngine', () => {
  let server: Server;
  let baseUrl: string;
  let nextRequest: Promise<ReceivedRequest>;

  beforeEach(async () => {
    nextRequest = new Promise<ReceivedRequest>((resolveRequest) => {
      server = createServer((request: IncomingMessage, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
            string,
            unknown
          >;
          resolveRequest({
            body,
            respond(responseBody: unknown, status: number): void {
              response.writeHead(status, { 'content-type': 'application/json' });
              response.end(JSON.stringify(responseBody));
            },
          });
        });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
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
  const successBody = {
    trip: { summary: { time: 475.465, length: 8.038 }, legs: [{ shape: 'encoded-shape' }] },
  };

  it('maps a successful Valhalla response into a RouteResult', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
    (await nextRequest).respond(successBody, 200);
    const result = await resultPromise;

    expect(result).toEqual({
      ok: true,
      value: { geometry: 'encoded-shape', distanceKm: 8.038, durationMin: 475.465 / 60 },
    });
  });

  it('sends truck costing options matching the profile dimensions, in Valhalla’s units', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
    const received = await nextRequest;
    received.respond(successBody, 200);
    await resultPromise;

    expect(received.body).toMatchObject({
      costing: 'truck',
      costing_options: { truck: { height: 4.2, width: 2.6, length: 16.5, weight: 32 } },
    });
    expect(received.body.exclude_polygons).toBeUndefined();
  });

  it('caps top_speed at 55mph (88kph) — a UK HGV limit isn’t always tagged on the road itself', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
    const received = await nextRequest;
    received.respond(successBody, 200);
    await resultPromise;

    expect(
      (received.body.costing_options as { truck: Record<string, unknown> }).truck.top_speed,
    ).toBe(88);
  });

  it('sends axle_load only when axleWeightT is present', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({
      origin,
      destination,
      dimensions: { ...dimensions, axleWeightT: 10 },
      avoid: [],
    });
    const received = await nextRequest;
    received.respond(successBody, 200);
    await resultPromise;

    expect(
      (received.body.costing_options as { truck: Record<string, unknown> }).truck.axle_load,
    ).toBe(10);
  });

  it('sends exclude_polygons for each avoid area, closing an unclosed ring', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({
      origin,
      destination,
      dimensions,
      avoid: [
        {
          points: [
            { lat: 54.98, lon: -2.1 },
            { lat: 54.98, lon: -2.09 },
            { lat: 54.97, lon: -2.09 },
          ],
        },
      ],
    });
    const received = await nextRequest;
    received.respond(successBody, 200);
    await resultPromise;

    expect(received.body.exclude_polygons).toEqual([
      [
        [-2.1, 54.98],
        [-2.09, 54.98],
        [-2.09, 54.97],
        [-2.1, 54.98], // closed: repeats the first point
      ],
    ]);
  });

  it('leaves an already-closed ring as-is, not double-closed', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({
      origin,
      destination,
      dimensions,
      avoid: [
        {
          points: [
            { lat: 54.98, lon: -2.1 },
            { lat: 54.98, lon: -2.09 },
            { lat: 54.97, lon: -2.09 },
            { lat: 54.98, lon: -2.1 },
          ],
        },
      ],
    });
    const received = await nextRequest;
    received.respond(successBody, 200);
    await resultPromise;

    const ring = (received.body.exclude_polygons as number[][][])[0];
    expect(ring).toHaveLength(4);
  });

  it('returns NoRouteFound (a Result error, not a throw) for a Valhalla routing failure', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
    (await nextRequest).respond(
      {
        error_code: 442,
        error: 'No path could be found for input',
        status_code: 400,
        status: 'Bad Request',
      },
      400,
    );
    const result = await resultPromise;

    expect(result).toEqual({ ok: false, error: { tag: 'NoRouteFound' } });
  });

  it('throws for a non-2xx response that is not Valhalla-error-shaped', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
    (await nextRequest).respond({ some: 'unexpected shape' }, 502);

    await expect(resultPromise).rejects.toThrow(/502/);
  });

  it('throws when a successful response has no legs', async () => {
    const engine = new ValhallaRoutingEngine(baseUrl);
    const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
    (await nextRequest).respond({ trip: { summary: { time: 1, length: 1 }, legs: [] } }, 200);

    await expect(resultPromise).rejects.toThrow(/no legs/);
  });

  describe('routeAlternatives', () => {
    it('sends an alternates count and maps trip + alternates into a RouteResult array', async () => {
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.routeAlternatives({
        origin,
        destination,
        dimensions,
        avoid: [],
      });
      const received = await nextRequest;
      expect(received.body.alternates).toBe(2);
      received.respond(
        {
          trip: { summary: { time: 475.465, length: 8.038 }, legs: [{ shape: 'primary-shape' }] },
          alternates: [
            {
              trip: { summary: { time: 600, length: 6 }, legs: [{ shape: 'alternate-shape' }] },
            },
          ],
        },
        200,
      );
      const result = await resultPromise;

      expect(result).toEqual({
        ok: true,
        value: [
          { geometry: 'primary-shape', distanceKm: 8.038, durationMin: 475.465 / 60 },
          { geometry: 'alternate-shape', distanceKm: 6, durationMin: 10 },
        ],
      });
    });

    it('returns just the primary route when Valhalla finds no alternates', async () => {
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.routeAlternatives({
        origin,
        destination,
        dimensions,
        avoid: [],
      });
      (await nextRequest).respond(successBody, 200);
      const result = await resultPromise;

      expect(result).toEqual({
        ok: true,
        value: [{ geometry: 'encoded-shape', distanceKm: 8.038, durationMin: 475.465 / 60 }],
      });
    });

    it('returns NoRouteFound for a Valhalla routing failure, same as route()', async () => {
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.routeAlternatives({
        origin,
        destination,
        dimensions,
        avoid: [],
      });
      (await nextRequest).respond({ error_code: 442, error: 'No path could be found' }, 400);
      const result = await resultPromise;

      expect(result).toEqual({ ok: false, error: { tag: 'NoRouteFound' } });
    });
  });
});
