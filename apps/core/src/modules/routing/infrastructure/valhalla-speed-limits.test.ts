import { describe, expect, it } from 'vitest';
import { encodePolyline } from '../application/testing/encode-polyline.js';
import type { GeoPoint } from '../domain/geo.js';
import { splitIntoPieces, ValhallaSpeedLimits } from './valhalla-speed-limits.js';

const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// A route running due east along the equator, about 111 m per 0.001 degrees.
const line = (points: number, stepDeg = 0.001): GeoPoint[] =>
  Array.from({ length: points }, (_, i) => ({ lat: 0, lon: i * stepDeg }));

describe('splitIntoPieces', () => {
  it('keeps a short route in one piece', () => {
    const { pieces, totalM } = splitIntoPieces(line(10));
    expect(pieces).toHaveLength(1);
    expect(totalM).toBeGreaterThan(900);
  });

  it('cuts a long route into pieces that share an end point and add up to the whole', () => {
    // 1,000 points about 111 m apart is about 111 km: more than one 50 km piece.
    const { pieces, totalM } = splitIntoPieces(line(1000));
    expect(pieces.length).toBeGreaterThan(1);
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i]!.points[0]).toEqual(pieces[i - 1]!.points.at(-1));
      expect(pieces[i]!.startM).toBeCloseTo(pieces[i - 1]!.startM + pieces[i - 1]!.lengthM, 3);
    }
    const last = pieces.at(-1)!;
    expect(last.startM + last.lengthM).toBeCloseTo(totalM, 3);
  });
});

describe('ValhallaSpeedLimits', () => {
  const route = encodePolyline(line(10));

  it('asks Valhalla to follow the route and turns the limits it finds into zones', async () => {
    let body: Record<string, unknown> = {};
    const source = new ValhallaSpeedLimits('http://valhalla', (url, init) => {
      expect(url).toBe('http://valhalla/trace_attributes');
      body = JSON.parse(init.body as string) as Record<string, unknown>;
      return Promise.resolve(
        reply(200, {
          edges: [
            { length: 0.5, speed_limit: 48, road_class: 'primary', use: 'road' },
            { length: 0.5, road_class: 'motorway', use: 'road' },
          ],
        }),
      );
    });
    const { zones } = await source.featuresAlong(route);
    expect(zones).toEqual([
      { from: 0, to: 0.5, limitMph: 30 },
      { from: 0.5, to: 1 },
    ]);
    expect(body['shape_match']).toBe('edge_walk');
    expect((body['shape'] as unknown[]).length).toBe(10);
  });

  it('says where the route runs over a bridge, as the points where it starts and ends', async () => {
    const matched = line(10);
    const source = new ValhallaSpeedLimits('http://valhalla', (_url, init) => {
      const attributes = (JSON.parse(init.body as string) as { filters: { attributes: string[] } })
        .filters.attributes;
      expect(attributes).toEqual(
        expect.arrayContaining(['edge.bridge', 'edge.begin_shape_index', 'shape']),
      );
      return Promise.resolve(
        reply(200, {
          shape: route,
          edges: [
            {
              length: 0.4,
              speed_limit: 112,
              bridge: false,
              begin_shape_index: 0,
              end_shape_index: 4,
            },
            {
              length: 0.1,
              speed_limit: 112,
              bridge: true,
              begin_shape_index: 4,
              end_shape_index: 5,
            },
            {
              length: 0.5,
              speed_limit: 112,
              bridge: false,
              begin_shape_index: 5,
              end_shape_index: 9,
            },
          ],
        }),
      );
    });
    const { bridges } = await source.featuresAlong(route);
    expect(bridges).toHaveLength(1);
    expect(bridges[0]!.from.lon).toBeCloseTo(matched[4]!.lon, 5);
    expect(bridges[0]!.to.lon).toBeCloseTo(matched[5]!.lon, 5);
  });

  it('lists the roads (OpenStreetMap ways) the route runs along, each once', async () => {
    const source = new ValhallaSpeedLimits('http://valhalla', (_url, init) => {
      const attributes = (JSON.parse(init.body as string) as { filters: { attributes: string[] } })
        .filters.attributes;
      expect(attributes).toContain('edge.way_id');
      return Promise.resolve(
        reply(200, {
          edges: [
            { length: 0.3, speed_limit: 112, way_id: 7001 },
            { length: 0.3, speed_limit: 112, way_id: 7001 }, // the same road, in two sections
            { length: 0.2, speed_limit: 112, way_id: 7002 },
            { length: 0.2, speed_limit: 112 }, // no way known for this section
          ],
        }),
      );
    });
    expect((await source.featuresAlong(route)).wayIds).toEqual([7001, 7002]);
  });

  it('counts only the part of the first and last section the route uses', async () => {
    const source = new ValhallaSpeedLimits('http://valhalla', () =>
      Promise.resolve(
        reply(200, {
          edges: [
            { length: 1, speed_limit: 48, source_percent_along: 0.5, target_percent_along: 1 },
            { length: 1, speed_limit: 80, source_percent_along: 0, target_percent_along: 0.5 },
          ],
        }),
      ),
    );
    // Half of each section is used, so each gets half the route.
    expect((await source.featuresAlong(route)).zones).toEqual([
      { from: 0, to: 0.5, limitMph: 30 },
      { from: 0.5, to: 1, limitMph: 50 },
    ]);
  });

  it('gives no signs, never an error, when Valhalla refuses or is down', async () => {
    const refused = new ValhallaSpeedLimits('http://valhalla', () => Promise.resolve(reply(400)));
    expect(await refused.featuresAlong(route)).toEqual({ zones: [], bridges: [], wayIds: [] });
    const down = new ValhallaSpeedLimits('http://valhalla', () => Promise.reject(new Error('x')));
    expect(await down.featuresAlong(route)).toEqual({ zones: [], bridges: [], wayIds: [] });
    const odd = new ValhallaSpeedLimits('http://valhalla', () => Promise.resolve(reply(200, {})));
    expect(await odd.featuresAlong(route)).toEqual({ zones: [], bridges: [], wayIds: [] });
  });

  it('remembers a route it read in full, but not one it could not', async () => {
    let calls = 0;
    let ok = false;
    const source = new ValhallaSpeedLimits('http://valhalla', () => {
      calls++;
      return Promise.resolve(
        ok ? reply(200, { edges: [{ length: 1, speed_limit: 48 }] }) : reply(500),
      );
    });
    await source.featuresAlong(route);
    await source.featuresAlong(route);
    expect(calls).toBe(2);
    ok = true;
    await source.featuresAlong(route);
    await source.featuresAlong(route);
    expect(calls).toBe(3);
  });
});
