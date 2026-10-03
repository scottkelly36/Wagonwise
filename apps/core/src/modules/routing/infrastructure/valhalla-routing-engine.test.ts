import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dimensions } from '../domain/vehicle-profile.js';
import { FALLBACK_TIME_FACTOR, ValhallaRoutingEngine } from './valhalla-routing-engine.js';

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
  // What the fake answers to /trace_route (the re-timing step). Defaults to a refusal, which makes
  // the engine use its fallback, so tests about route choice don't each need to script it.
  let traceReply: { status: number; body: unknown };
  let traceRequests: Record<string, unknown>[];

  beforeEach(async () => {
    traceReply = { status: 400, body: { error_code: 442, error: 'No path could be found' } };
    traceRequests = [];
    nextRequest = new Promise<ReceivedRequest>((resolveRequest) => {
      server = createServer((request: IncomingMessage, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
            string,
            unknown
          >;
          if (request.url === '/trace_route') {
            traceRequests.push(body);
            response.writeHead(traceReply.status, { 'content-type': 'application/json' });
            response.end(JSON.stringify(traceReply.body));
            return;
          }
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
      value: {
        geometry: 'encoded-shape',
        distanceKm: 8.038,
        durationMin: (475.465 * FALLBACK_TIME_FACTOR) / 60,
      },
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

  describe('choosing the road versus timing it (2026-10-03)', () => {
    // A real polyline6 of two known points, so the engine can decode it for the re-timing request.
    // The encoder is test-only and separate from the shipped decoder, so a bug shared by both
    // couldn't hide behind a round trip.
    const encodeValue = (value: number): string => {
      let shifted = value < 0 ? ~(value << 1) : value << 1;
      let chars = '';
      while (shifted >= 0x20) {
        chars += String.fromCharCode((shifted & 0x1f) + 0x20 + 63);
        shifted >>= 5;
      }
      return chars + String.fromCharCode(shifted + 63);
    };
    const line = [
      { lat: 54.9707, lon: -2.1013 },
      { lat: 54.9738, lon: -2.0165 },
    ];
    const shape = line
      .map((p, i) => {
        const prev = line[i - 1] ?? { lat: 0, lon: 0 };
        return (
          encodeValue(Math.round(p.lat * 1e6) - Math.round(prev.lat * 1e6)) +
          encodeValue(Math.round(p.lon * 1e6) - Math.round(prev.lon * 1e6))
        );
      })
      .join('');

    it('does not cap speed when choosing the route: the cap flattens road speeds and picked the back road over the A69', async () => {
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
      const received = await nextRequest;
      received.respond(successBody, 200);
      await resultPromise;

      expect(
        (received.body.costing_options as { truck: Record<string, unknown> }).truck.top_speed,
      ).toBeUndefined();
    });

    it('times the chosen road with the 55mph cap (88kph), walking its exact shape', async () => {
      traceReply = { status: 200, body: { trip: { summary: { time: 900, length: 8.038 } } } };
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.route({
        origin,
        destination,
        dimensions: { ...dimensions, axleWeightT: 10 },
        avoid: [],
      });
      (await nextRequest).respond(
        { trip: { summary: { time: 475.465, length: 8.038 }, legs: [{ shape }] } },
        200,
      );
      const result = await resultPromise;

      expect(result).toEqual({
        ok: true,
        value: { geometry: shape, distanceKm: 8.038, durationMin: 15 },
      });
      expect(traceRequests).toHaveLength(1);
      expect(traceRequests[0]).toMatchObject({
        shape_match: 'edge_walk',
        costing: 'truck',
        costing_options: {
          truck: {
            height: 4.2,
            width: 2.6,
            length: 16.5,
            weight: 32,
            axle_load: 10,
            top_speed: 88,
          },
        },
      });
      expect(traceRequests[0]?.shape).toEqual(line);
    });

    it('falls back to the scaled uncapped time when Valhalla cannot walk the shape (e.g. over its distance limit)', async () => {
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
      (await nextRequest).respond(
        { trip: { summary: { time: 600, length: 8 }, legs: [{ shape }] } },
        200,
      );
      const result = await resultPromise;

      expect(result.ok && result.value.durationMin).toBeCloseTo((600 * FALLBACK_TIME_FACTOR) / 60);
    });

    it('also falls back, rather than failing the route, when the re-timing answer is unusable', async () => {
      traceReply = { status: 200, body: { trip: { summary: {} } } };
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.route({ origin, destination, dimensions, avoid: [] });
      (await nextRequest).respond(
        { trip: { summary: { time: 600, length: 8 }, legs: [{ shape }] } },
        200,
      );
      const result = await resultPromise;

      expect(result.ok && result.value.durationMin).toBeCloseTo((600 * FALLBACK_TIME_FACTOR) / 60);
    });

    it('re-times each alternative separately', async () => {
      traceReply = { status: 200, body: { trip: { summary: { time: 1200, length: 1 } } } };
      const engine = new ValhallaRoutingEngine(baseUrl);
      const resultPromise = engine.routeAlternatives({
        origin,
        destination,
        dimensions,
        avoid: [],
      });
      (await nextRequest).respond(
        {
          trip: { summary: { time: 400, length: 8 }, legs: [{ shape }] },
          alternates: [{ trip: { summary: { time: 500, length: 9 }, legs: [{ shape }] } }],
        },
        200,
      );
      await resultPromise;

      expect(traceRequests).toHaveLength(2);
    });
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
          {
            geometry: 'primary-shape',
            distanceKm: 8.038,
            durationMin: (475.465 * FALLBACK_TIME_FACTOR) / 60,
          },
          {
            geometry: 'alternate-shape',
            distanceKm: 6,
            durationMin: (600 * FALLBACK_TIME_FACTOR) / 60,
          },
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
        value: [
          {
            geometry: 'encoded-shape',
            distanceKm: 8.038,
            durationMin: (475.465 * FALLBACK_TIME_FACTOR) / 60,
          },
        ],
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
