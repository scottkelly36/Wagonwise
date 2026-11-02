import type { RouteClosureDto } from '@wagonwise/contracts/closures';

import { LONG_WINDOW_HOURS } from './closure-details';

/** How far from the route's line a closure's line may be and still be the road the route runs on. A bit over half a lane either side:
 *  National Highways draws its lines and the router draws its own, and the two do not sit exactly on one another. */
export const CLOSURE_MATCH_M = 25;

/** How far the route's heading may differ from the closure's direction of travel. This is what tells the carriageway the route is on
 *  from the other one, which is only about 30 m away; a road that crosses the route is turned well beyond it. */
export const CLOSURE_HEADING_DEG = 45;

/** A closure's lines are cut into pieces no longer than this, so a long straight stretch is judged all along and not by its two ends. */
const PIECE_M = 40;

/** A closure this short is a slip road, a link road or a short stretch. A route on the main carriageway runs beside the start of a
 *  slip road for a hundred metres or so with the same heading; only a route that takes the slip road runs along nearly all of it. */
const SHORT_CLOSURE_M = 700;
const SHORT_CLOSURE_SHARE = 0.8;

/** A longer closure is a stretch of carriageway. A route that joins or leaves part-way along it still drives on the shut road. */
const LONG_CLOSURE_MIN_M = 300;

/** Route segments further than this from a closure are not looked at. */
const SEARCH_PAD_M = 80;

/** How wrong the arrival time may be: half an hour, and a tenth of the time already spent driving (traffic, breaks, a late start). */
const ARRIVAL_MARGIN_MIN = 30;
const ARRIVAL_MARGIN_SHARE = 0.1;

const METRES_PER_DEGREE_LAT = 111_320;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

type LonLat = readonly [number, number];

/** A closure the route runs along, and where. */
export interface PlacedClosure {
  readonly closure: RouteClosureDto;
  /** Metres along the route to where it starts and ends. */
  readonly fromM: number;
  readonly toM: number;
  /** The length of the whole route in metres, the same measure `fromM` and `toM` are on. */
  readonly routeM: number;
}

/** A placed closure that will be in force when the driver gets there. */
export interface ClosureOnRoute extends PlacedClosure {
  /** When the driver is expected at the start of it. */
  readonly arrivesAt: Date;
  /** The scheme's window is long (days), so it is not necessarily shut at that time: the feed does not say which nights. */
  readonly mayBeOpen: boolean;
}

interface RouteIndex {
  readonly line: readonly LonLat[];
  /** Metres along the route at each vertex; index 0 is 0. */
  readonly offsets: readonly number[];
}

function indexRoute(line: readonly LonLat[]): RouteIndex {
  const offsets: number[] = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx =
      (b[0] - a[0]) * METRES_PER_DEGREE_LAT * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
    const dy = (b[1] - a[1]) * METRES_PER_DEGREE_LAT;
    offsets.push(offsets[i - 1]! + Math.hypot(dx, dy));
  }
  return { line, offsets };
}

/** A short stretch of a closure's line: its middle, which way traffic goes along it, and how long it is. All in the closure's own
 *  local metres (x east, y north of the closure's position). */
interface Piece {
  readonly x: number;
  readonly y: number;
  readonly headingDeg: number;
  readonly lengthM: number;
}

const headingOf = (dx: number, dy: number): number =>
  ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

function headingGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/** The pieces of every line of the closure. Each line runs in the direction of travel (National Highways draws it from where traffic
 *  enters the shut stretch to where it leaves), whatever order the lines are listed in. */
function piecesOf(lines: RouteClosureDto['lines'], origin: { lat: number; lon: number }): Piece[] {
  const perDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  const pieces: Piece[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const ax = (a.lon - origin.lon) * perDegreeLon;
      const ay = (a.lat - origin.lat) * METRES_PER_DEGREE_LAT;
      const dx = (b.lon - origin.lon) * perDegreeLon - ax;
      const dy = (b.lat - origin.lat) * METRES_PER_DEGREE_LAT - ay;
      const length = Math.hypot(dx, dy);
      if (length === 0) continue;
      const count = Math.ceil(length / PIECE_M);
      for (let k = 0; k < count; k++) {
        const middle = (k + 0.5) / count;
        pieces.push({
          x: ax + dx * middle,
          y: ay + dy * middle,
          headingDeg: headingOf(dx, dy),
          lengthM: length / count,
        });
      }
    }
  }
  return pieces;
}

/**
 * Those of `closures` that the route runs along, with where. The route has to run on the closure's own line, going the way the closure
 * goes: a closure on the other carriageway, a road that crosses the route, or a slip road the route only passes is not the driver's.
 * The geometry does not depend on when the driver leaves, so it is worked out once per route and set of closures; see
 * {@link closuresAtArrival} for the time.
 */
export function placeClosuresOnRoute(
  routeLine: readonly LonLat[],
  closures: readonly RouteClosureDto[],
): PlacedClosure[] {
  if (routeLine.length < 2) return [];
  const route = indexRoute(routeLine);
  const routeM = route.offsets[route.offsets.length - 1]!;
  const placed: PlacedClosure[] = [];

  for (const closure of closures) {
    const origin = closure.location;
    const perDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
    const pieces = piecesOf(closure.lines, origin);
    if (pieces.length === 0) continue;

    // The part of the route near the closure, in the same local metres as the pieces.
    const near = nearbySegments(route, pieces, origin, perDegreeLon);
    if (near.length === 0) continue;

    let closureM = 0;
    let coveredM = 0;
    let fromM = Infinity;
    let toM = -Infinity;
    for (const piece of pieces) {
      closureM += piece.lengthM;
      const at = bestSegment(near, piece);
      if (at === undefined) continue;
      coveredM += piece.lengthM;
      const along = route.offsets[at.index]! + at.t * at.lengthM;
      fromM = Math.min(fromM, along);
      toM = Math.max(toM, along);
    }
    const runsAlong =
      closureM < SHORT_CLOSURE_M
        ? coveredM >= SHORT_CLOSURE_SHARE * closureM
        : coveredM >= LONG_CLOSURE_MIN_M;
    if (runsAlong) placed.push({ closure, fromM, toM, routeM });
  }
  return placed.sort((a, b) => a.fromM - b.fromM);
}

interface NearSegment {
  /** Index of the segment's first vertex in the route. */
  readonly index: number;
  readonly ax: number;
  readonly ay: number;
  readonly dx: number;
  readonly dy: number;
  readonly headingDeg: number;
  /** Length in metres on the route's own measure, which is what offsets add up. */
  readonly lengthM: number;
  readonly lengthSq: number;
}

function nearbySegments(
  route: RouteIndex,
  pieces: readonly Piece[],
  origin: { lat: number; lon: number },
  perDegreeLon: number,
): NearSegment[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pieces) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  minX -= SEARCH_PAD_M;
  maxX += SEARCH_PAD_M;
  minY -= SEARCH_PAD_M;
  maxY += SEARCH_PAD_M;

  const near: NearSegment[] = [];
  for (let i = 0; i < route.line.length - 1; i++) {
    const a = route.line[i]!;
    const b = route.line[i + 1]!;
    const ax = (a[0] - origin.lon) * perDegreeLon;
    const ay = (a[1] - origin.lat) * METRES_PER_DEGREE_LAT;
    const bx = (b[0] - origin.lon) * perDegreeLon;
    const by = (b[1] - origin.lat) * METRES_PER_DEGREE_LAT;
    if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX) continue;
    if (Math.max(ay, by) < minY || Math.min(ay, by) > maxY) continue;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) continue;
    near.push({
      index: i,
      ax,
      ay,
      dx,
      dy,
      headingDeg: headingOf(dx, dy),
      lengthM: route.offsets[i + 1]! - route.offsets[i]!,
      lengthSq,
    });
  }
  return near;
}

/** The nearest stretch of route within reach of the piece that goes the same way, and how far along that segment the piece is. */
function bestSegment(
  near: readonly NearSegment[],
  piece: Piece,
): { index: number; t: number; lengthM: number } | undefined {
  let best: { index: number; t: number; lengthM: number } | undefined;
  let bestDistance = CLOSURE_MATCH_M;
  for (const s of near) {
    const t = Math.min(
      1,
      Math.max(0, ((piece.x - s.ax) * s.dx + (piece.y - s.ay) * s.dy) / s.lengthSq),
    );
    const distance = Math.hypot(piece.x - (s.ax + t * s.dx), piece.y - (s.ay + t * s.dy));
    if (distance > bestDistance) continue;
    if (headingGap(s.headingDeg, piece.headingDeg) > CLOSURE_HEADING_DEG) continue;
    bestDistance = distance;
    best = { index: s.index, t, lengthM: s.lengthM };
  }
  return best;
}

/**
 * Those of the placed closures that will be in force when the driver gets to them, leaving at `leaveAtMs` and driving for
 * `durationMin` in all (the time to a point is taken in proportion to the distance, which is as good as the route's own estimate).
 * The arrival time is not exact, so a closure counts if it is in force at any time from half an hour (and a tenth of the drive so
 * far) before the driver reaches it to the same after they pass it. Nearest to the start first.
 */
export function closuresAtArrival(
  placed: readonly PlacedClosure[],
  trip: { readonly leaveAtMs: number; readonly durationMin: number },
): ClosureOnRoute[] {
  const totalMs = trip.durationMin * MS_PER_MINUTE;
  const found: ClosureOnRoute[] = [];
  for (const p of placed) {
    const share = (metres: number) => (p.routeM === 0 ? 0 : metres / p.routeM);
    const arrivesMs = trip.leaveAtMs + totalMs * share(p.fromM);
    const passesMs = trip.leaveAtMs + totalMs * share(p.toM);
    const margin =
      ARRIVAL_MARGIN_MIN * MS_PER_MINUTE + ARRIVAL_MARGIN_SHARE * (arrivesMs - trip.leaveAtMs);
    const startsMs = new Date(p.closure.startsAt).getTime();
    const endsMs = new Date(p.closure.endsAt).getTime();
    if (arrivesMs - margin > endsMs || passesMs + margin < startsMs) continue;
    found.push({
      ...p,
      arrivesAt: new Date(arrivesMs),
      mayBeOpen: (endsMs - startsMs) / MS_PER_HOUR > LONG_WINDOW_HOURS,
    });
  }
  return found;
}
