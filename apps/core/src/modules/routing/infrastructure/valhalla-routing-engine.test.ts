import { readFileSync } from 'node:fs';
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
        maneuvers: [],
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
        value: { geometry: shape, distanceKm: 8.038, durationMin: 15, maneuvers: [] },
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
            maneuvers: [],
          },
          {
            geometry: 'alternate-shape',
            distanceKm: 6,
            durationMin: (600 * FALLBACK_TIME_FACTOR) / 60,
            maneuvers: [],
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
            maneuvers: [],
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

describe('turn-by-turn directions (P2-M10)', () => {
  let server: Server;
  let baseUrl: string;
  let lastBody: Record<string, unknown> | undefined;
  let reply: unknown;

  beforeEach(async () => {
    lastBody = undefined;
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        if (request.url !== '/trace_route') lastBody = body;
        // The re-timing step is refused, which makes the engine use its fallback: not under test.
        const status = request.url === '/trace_route' ? 400 : 200;
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify(request.url === '/trace_route' ? { error_code: 442, error: 'no' } : reply),
        );
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
  const origin = { lat: 54.9708, lon: -2.1013 };
  const destination = { lat: 54.9735, lon: -1.541 };
  // A real Valhalla answer for Hexham to Hebburn (recorded 2026-10-04): 30 steps, mostly
  // roundabouts, which is exactly what spoken directions have to get right.
  const recorded = JSON.parse(
    readFileSync(new URL('./testing/valhalla-hexham-hebburn.json', import.meta.url), 'utf8'),
  ) as { trip: { summary: { length: number }; legs: { maneuvers: unknown[] }[] } };

  it('asks for British English directions in kilometres', async () => {
    reply = recorded;
    await new ValhallaRoutingEngine(baseUrl).route({ origin, destination, dimensions, avoid: [] });
    expect(lastBody?.directions_options).toEqual({ units: 'kilometers', language: 'en-GB' });
  });

  it('turns the recorded route into steps, each with its kind, wording and distance', async () => {
    reply = recorded;
    const result = await new ValhallaRoutingEngine(baseUrl).route({
      origin,
      destination,
      dimensions,
      avoid: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const steps = result.value.maneuvers;

    expect(steps).toHaveLength(30);
    expect(steps[0]).toMatchObject({ kind: 'depart', beginShapeIndex: 0 });
    expect(steps.at(-1)).toMatchObject({ kind: 'arrive' });

    // A left turn keeps its spoken wording (no distance in it) and its road numbers
    const hencotes = steps.find((s) => s.speech.includes('Hencotes'));
    expect(hencotes).toMatchObject({
      kind: 'left',
      speech: 'Turn left onto Hencotes, B6305.',
      streetNames: ['B6305'],
    });

    // A roundabout carries which exit to take
    const roundabout = steps.find((s) => s.kind === 'roundabout');
    expect(roundabout).toMatchObject({
      speech: 'Enter the roundabout and take the 3rd exit onto A6079.',
      roundaboutExit: 3,
    });
  });

  it('gives lengths in whole metres that add up to the route', async () => {
    reply = recorded;
    const result = await new ValhallaRoutingEngine(baseUrl).route({
      origin,
      destination,
      dimensions,
      avoid: [],
    });
    if (!result.ok) throw new Error('route failed');
    const totalM = result.value.maneuvers.reduce((sum, s) => sum + s.lengthM, 0);
    expect(Number.isInteger(result.value.maneuvers[1]?.lengthM)).toBe(true);
    // Within 1% of the route's own length (each step is rounded to a metre)
    expect(
      Math.abs(totalM - result.value.distanceKm * 1000) / (result.value.distanceKm * 1000),
    ).toBeLessThan(0.01);
  });

  it('keeps step order, and begins each one later along the route than the last', async () => {
    reply = recorded;
    const result = await new ValhallaRoutingEngine(baseUrl).route({
      origin,
      destination,
      dimensions,
      avoid: [],
    });
    if (!result.ok) throw new Error('route failed');
    const indexes = result.value.maneuvers.map((s) => s.beginShapeIndex);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('maps unknown turn types to "straight" rather than failing', async () => {
    reply = {
      trip: {
        summary: { time: 60, length: 1 },
        legs: [
          {
            shape: 'x',
            maneuvers: [
              { type: 8, instruction: 'Continue.', length: 1, begin_shape_index: 0 },
              { type: 999, instruction: 'Something new.', length: 0, begin_shape_index: 3 },
            ],
          },
        ],
      },
    };
    const result = await new ValhallaRoutingEngine(baseUrl).route({
      origin,
      destination,
      dimensions,
      avoid: [],
    });
    if (!result.ok) throw new Error('route failed');
    expect(result.value.maneuvers.map((s) => s.kind)).toEqual(['straight', 'straight']);
    // With no spoken version supplied, the display text is used
    expect(result.value.maneuvers[0]?.speech).toBe('Continue.');
  });

  it('gives no steps when the engine gave none', async () => {
    reply = { trip: { summary: { time: 60, length: 1 }, legs: [{ shape: 'x' }] } };
    const result = await new ValhallaRoutingEngine(baseUrl).route({
      origin,
      destination,
      dimensions,
      avoid: [],
    });
    if (!result.ok) throw new Error('route failed');
    expect(result.value.maneuvers).toEqual([]);
  });
});
