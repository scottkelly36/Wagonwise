import type { SpeedLimitSource } from '../application/ports/speed-limit-source.js';
import { decodePolyline, type GeoLine, type GeoPoint } from '../domain/geo.js';
import { joinZones, zonesFromEdges, type RoadEdge, type SpeedZone } from '../domain/speed-zone.js';

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
  private readonly cache = new Map<GeoLine, SpeedZone[]>();

  constructor(
    private readonly baseUrl: string,
    private readonly doFetch: Fetch = (url, init) => fetch(url, init),
  ) {}

  async zonesAlong(route: GeoLine): Promise<SpeedZone[]> {
    const cached = this.cache.get(route);
    if (cached !== undefined) return cached;

    const { pieces, totalM } = splitIntoPieces(decodePolyline(route));
    if (totalM <= 0) return [];

    const results: (SpeedZone[] | undefined)[] = new Array<SpeedZone[] | undefined>(pieces.length);
    for (let i = 0; i < pieces.length; i += PIECES_AT_ONCE) {
      await Promise.all(
        pieces.slice(i, i + PIECES_AT_ONCE).map(async (piece, offset) => {
          results[i + offset] = await this.readPiece(piece, totalM);
        }),
      );
    }

    const zones = joinZones(results.flatMap((r) => r ?? []));
    // A failed piece is not remembered, so asking again can fill it in.
    if (results.every((r) => r !== undefined)) this.remember(route, zones);
    return zones;
  }

  private remember(route: GeoLine, zones: SpeedZone[]): void {
    if (this.cache.size >= CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(route, zones);
  }

  /** The zones for one piece, or `undefined` if it could not be read. */
  private async readPiece(piece: Piece, totalM: number): Promise<SpeedZone[] | undefined> {
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
              'edge.source_percent_along',
              'edge.target_percent_along',
            ],
            action: 'include',
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { edges?: unknown };
      if (!Array.isArray(body.edges)) return undefined;
      return zonesFromEdges(
        (body.edges as TraceEdge[]).map(toRoadEdge),
        piece.startM / totalM,
        (piece.startM + piece.lengthM) / totalM,
      );
    } catch {
      return undefined;
    }
  }
}
