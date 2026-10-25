import type { SpeedLimitSource } from '../application/ports/speed-limit-source.js';
import { decodePolyline, type GeoLine, type GeoPoint } from '../domain/geo.js';
import {
  bridgesFromShape,
  wayIdsFromEdges,
  joinBridges,
  joinWayIds,
  joinZones,
  zonesFromEdges,
  type RoadEdge,
  type RoadFeatures,
} from '../domain/speed-zone.js';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// Valhalla refuses a trace over its point or distance limit, so a long route is read in pieces. Pieces share an end
// point so no road is missed between them.
const MAX_POINTS_PER_PIECE = 5000;
const MAX_METRES_PER_PIECE = 50_000;
const PIECES_AT_ONCE = 4;
const REQUEST_TIMEOUT_MS = 20_000;
// Plans are read once a trip but may be asked for again (app restarts); a few recent routes are kept.
const CACHE_SIZE = 50;

const EARTH_RADIUS_M = 6_371_000;
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Piece {
  readonly points: GeoPoint[];
  /** Metres from the start of the route to the start of this piece, and its own length. */
  readonly startM: number;
  readonly lengthM: number;
}

/** The route cut into pieces that stay within the limits. */
export function splitIntoPieces(points: readonly GeoPoint[]): { pieces: Piece[]; totalM: number } {
  const pieces: Piece[] = [];
  let current: GeoPoint[] = [];
  let startM = 0;
  let lengthM = 0;
  let travelled = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const step = i === 0 ? 0 : metresBetween(points[i - 1]!, point);
    if (
      current.length > 1 &&
      (current.length >= MAX_POINTS_PER_PIECE || lengthM + step > MAX_METRES_PER_PIECE)
    ) {
      pieces.push({ points: current, startM, lengthM });
      startM += lengthM;
      current = [points[i - 1]!];
      lengthM = 0;
    }
    current.push(point);
    lengthM += step;
    travelled += step;
  }
  if (current.length > 1) pieces.push({ points: current, startM, lengthM });
  return { pieces, totalM: travelled };
}

interface TraceEdge {
  length?: unknown;
  speed_limit?: unknown;
  road_class?: unknown;
  use?: unknown;
  source_percent_along?: unknown;
  target_percent_along?: unknown;
  bridge?: unknown;
  begin_shape_index?: unknown;
  end_shape_index?: unknown;
  way_id?: unknown;
}

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The part of an edge the route uses: the first and last sections can be cut part-way along. */
function toRoadEdge(e: TraceEdge): RoadEdge {
  const length = typeof e.length === 'number' && e.length > 0 ? e.length : 0;
  const from = typeof e.source_percent_along === 'number' ? e.source_percent_along : 0;
  const to = typeof e.target_percent_along === 'number' ? e.target_percent_along : 1;
  const share = to > from ? to - from : 1;
  return {
    length: length * share,
    speedLimitKph:
      typeof e.speed_limit === 'number' || typeof e.speed_limit === 'string'
        ? e.speed_limit
        : undefined,
    roadClass: text(e.road_class),
    use: text(e.use),
  };
}

/**
 * Reads the speed limits along a route from Valhalla's map (`trace_attributes` on the route's own line, so it follows
 * exactly the roads the route uses). Anything that goes wrong gives no zones for that piece, never an error: the driver
 * just sees no sign there.
 */
export class ValhallaSpeedLimits implements SpeedLimitSource {
  private readonly cache = new Map<GeoLine, RoadFeatures>();

  constructor(
    private readonly baseUrl: string,
    private readonly doFetch: Fetch = (url, init) => fetch(url, init),
  ) {}

  async featuresAlong(route: GeoLine): Promise<RoadFeatures> {
    const cached = this.cache.get(route);
    if (cached !== undefined) return cached;

    const { pieces, totalM } = splitIntoPieces(decodePolyline(route));
    if (totalM <= 0) return { zones: [], bridges: [], wayIds: [] };

    const results: (RoadFeatures | undefined)[] = new Array<RoadFeatures | undefined>(
      pieces.length,
    );
    for (let i = 0; i < pieces.length; i += PIECES_AT_ONCE) {
      await Promise.all(
        pieces.slice(i, i + PIECES_AT_ONCE).map(async (piece, offset) => {
          results[i + offset] = await this.readPiece(piece, totalM);
        }),
      );
    }

    const features: RoadFeatures = {
      zones: joinZones(results.flatMap((r) => r?.zones ?? [])),
      bridges: joinBridges(results.flatMap((r) => r?.bridges ?? [])),
      wayIds: joinWayIds(results.map((r) => r?.wayIds ?? [])),
    };
    // A failed piece is not remembered, so asking again can fill it in.
    if (results.every((r) => r !== undefined)) this.remember(route, features);
    return features;
  }

  private remember(route: GeoLine, features: RoadFeatures): void {
    if (this.cache.size >= CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(route, features);
  }

  /** What one piece shows, or `undefined` if it could not be read. */
  private async readPiece(piece: Piece, totalM: number): Promise<RoadFeatures | undefined> {
    try {
      const response = await this.doFetch(`${this.baseUrl}/trace_attributes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: piece.points.map((p) => ({ lat: p.lat, lon: p.lon })),
          shape_match: 'edge_walk',
          costing: 'auto',
          filters: {
            attributes: [
              'edge.length',
              'edge.speed_limit',
              'edge.road_class',
              'edge.use',
              'edge.bridge',
              'edge.way_id',
              'edge.begin_shape_index',
              'edge.end_shape_index',
              'shape',
              'edge.source_percent_along',
              'edge.target_percent_along',
            ],
            action: 'include',
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { edges?: unknown; shape?: unknown };
      if (!Array.isArray(body.edges)) return undefined;
      const traced = body.edges as TraceEdge[];
      const edges = traced.map(toRoadEdge);
      // Where the bridges are: the matched line (so the edges' shape indexes mean something) and which sections are bridge.
      const shape = typeof body.shape === 'string' ? decodePolyline(body.shape) : [];
      const bridgeEdges = traced.map((e) => ({
        bridge: e.bridge === true,
        beginShapeIndex: typeof e.begin_shape_index === 'number' ? e.begin_shape_index : -1,
        endShapeIndex: typeof e.end_shape_index === 'number' ? e.end_shape_index : -1,
      }));
      const start = piece.startM / totalM;
      const end = (piece.startM + piece.lengthM) / totalM;
      return {
        zones: zonesFromEdges(edges, start, end),
        bridges: bridgesFromShape(bridgeEdges, shape),
        wayIds: wayIdsFromEdges(traced.map((e) => ({ wayId: e.way_id }))),
      };
    } catch {
      return undefined;
    }
  }
}
