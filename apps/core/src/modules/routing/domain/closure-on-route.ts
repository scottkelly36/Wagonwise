import type { GeoPoint } from './geo.js';
import type { AvoidedRestriction } from './route-plan.js';

/**
 * A road or lane closure near a route, in routing's own terms (AGENTS.md rule 7): the `closures` module's facade is read through
 * an adapter that translates into this, so routing never imports a `Closure`.
 */
export interface ClosureCandidate {
  readonly id: string;
  /** `full`: a whole carriageway, slip road or link road is shut. `lane`: lanes are shut and the road stays open. */
  readonly kind: 'full' | 'lane';
  /** National Highways' own words, for telling the driver what was avoided. */
  readonly description: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Where the closure is, for working in local metres around it. */
  readonly position: GeoPoint;
  /** Where it runs: one or more lines, each drawn in the direction of travel (see {@link placeClosuresOnRoute}). */
  readonly lines: readonly (readonly GeoPoint[])[];
}

/**
 * How far from the route's line a closure's line may be and still be the road the route runs on: a bit over half a lane either side.
 * National Highways draws its lines and the router draws its own, and the two do not sit exactly on one another.
 *
 * The driver app decides the same thing for the route screen (`apps/driver-app/src/lib/closures-on-route.ts`) and the two must
 * agree, or the screen would warn about a closure the route planning did not go round, or the other way about. Change both together.
 */
export const CLOSURE_MATCH_M = 25;

/** How far the route's heading may differ from the closure's direction of travel. This is what tells the carriageway the route is
 *  on from the other one, which is only about 30 m away; a road that crosses the route is turned well beyond it. */
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
export const ARRIVAL_MARGIN_MIN = 30;
export const ARRIVAL_MARGIN_SHARE = 0.1;

/** A window longer than this is a scheme that runs for days, which the feed does not break into the nights it is really shut: the road
 *  may be open at the time, so a route is not sent the long way round for it. */
export const LONG_WINDOW_HOURS = 48;

const METRES_PER_DEGREE_LAT = 111_320;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

/** A closure the route runs along, and where. */
export interface PlacedClosure {
  readonly closure: ClosureCandidate;
  /** Metres along the route to where it starts and ends. */
  readonly fromM: number;
  readonly toM: number;
  /** Metres along the route at each stretch of the closure it runs along, in order. Not the same as the span from `fromM` to `toM`
   *  when a route meets the closure more than once. */
  readonly matchedM: readonly number[];
  /** The length of the whole route in metres, the same measure the offsets above are on. */
  readonly routeM: number;
}

/** A placed closure that will be in force when the driver gets there. */
export interface ClosureOnRoute extends PlacedClosure {
  /** When the driver is expected at the start of it. */
  readonly arrivesAt: Date;
  /** The scheme's window is long (days), so it is not necessarily shut at that time. */
  readonly mayBeOpen: boolean;
}

/** A route as a line of points with the distance along it at each. */
export interface IndexedRoute {
  readonly points: readonly GeoPoint[];
  /** Metres along the route at each vertex; index 0 is 0. */
  readonly offsets: readonly number[];
}

export function indexRoute(points: readonly GeoPoint[]): IndexedRoute {
  const offsets: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx =
      (b.lon - a.lon) * METRES_PER_DEGREE_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    const dy = (b.lat - a.lat) * METRES_PER_DEGREE_LAT;
    offsets.push(offsets[i - 1]! + Math.hypot(dx, dy));
  }
  return { points, offsets };
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
 *  enters the shut stretch to where it leaves), whatever order the lines are listed in. The feed's compass word is not used: it is not
 *  reliable (an "eastBound" slip road is described as northbound). */
function piecesOf(lines: ClosureCandidate['lines'], origin: GeoPoint): Piece[] {
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

/** The part of the route near the closure, in the same local metres as the pieces. */
function nearbySegments(
  route: IndexedRoute,
  pieces: readonly Piece[],
  origin: GeoPoint,
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
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i]!;
    const b = route.points[i + 1]!;
    const ax = (a.lon - origin.lon) * perDegreeLon;
    const ay = (a.lat - origin.lat) * METRES_PER_DEGREE_LAT;
    const bx = (b.lon - origin.lon) * perDegreeLon;
    const by = (b.lat - origin.lat) * METRES_PER_DEGREE_LAT;
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
 * Those of `closures` that the route runs along, with where. The route has to run on the closure's own line, going the way the
 * closure goes: a closure on the other carriageway, a road that crosses the route, or a slip road the route only passes is not the
 * driver's. The geometry does not depend on when the driver leaves; see {@link closuresAtArrival} for the time.
 */
export function placeClosuresOnRoute(
  route: IndexedRoute,
  closures: readonly ClosureCandidate[],
): PlacedClosure[] {
  if (route.points.length < 2) return [];
  const routeM = route.offsets[route.offsets.length - 1]!;
  const placed: PlacedClosure[] = [];

  for (const closure of closures) {
    const origin = closure.position;
    const perDegreeLon = METRES_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
    const pieces = piecesOf(closure.lines, origin);
    if (pieces.length === 0) continue;

    const near = nearbySegments(route, pieces, origin, perDegreeLon);
    if (near.length === 0) continue;

    let closureM = 0;
    let coveredM = 0;
    const matchedM: number[] = [];
    for (const piece of pieces) {
      closureM += piece.lengthM;
      const at = bestSegment(near, piece);
      if (at === undefined) continue;
      coveredM += piece.lengthM;
      matchedM.push(route.offsets[at.index]! + at.t * at.lengthM);
    }
    const runsAlong =
      closureM < SHORT_CLOSURE_M
        ? coveredM >= SHORT_CLOSURE_SHARE * closureM
        : coveredM >= LONG_CLOSURE_MIN_M;
    if (!runsAlong) continue;
    matchedM.sort((a, b) => a - b);
    placed.push({
      closure,
      fromM: matchedM[0]!,
      toM: matchedM[matchedM.length - 1]!,
      matchedM,
      routeM,
    });
  }
  return placed.sort((a, b) => a.fromM - b.fromM);
}

/**
 * Those of the placed closures that will be in force when the driver gets to them, leaving at `departAt` and driving for
 * `durationMin` in all (the time to a point is taken in proportion to the distance, which is as good as the route's own estimate).
 * The arrival time is not exact, so a closure counts if it is in force at any time from half an hour (and a tenth of the drive so
 * far) before the driver reaches it to the same after they pass it. Nearest to the start first.
 */
export function closuresAtArrival(
  placed: readonly PlacedClosure[],
  trip: { readonly departAt: Date; readonly durationMin: number },
): ClosureOnRoute[] {
  const leaveMs = trip.departAt.getTime();
  const totalMs = trip.durationMin * MS_PER_MINUTE;
  const found: ClosureOnRoute[] = [];
  for (const p of placed) {
    const share = (metres: number) => (p.routeM === 0 ? 0 : metres / p.routeM);
    const arrivesMs = leaveMs + totalMs * share(p.fromM);
    const passesMs = leaveMs + totalMs * share(p.toM);
    const margin =
      ARRIVAL_MARGIN_MIN * MS_PER_MINUTE + ARRIVAL_MARGIN_SHARE * (arrivesMs - leaveMs);
    const startsMs = p.closure.startsAt.getTime();
    const endsMs = p.closure.endsAt.getTime();
    if (arrivesMs - margin > endsMs || passesMs + margin < startsMs) continue;
    found.push({
      ...p,
      arrivesAt: new Date(arrivesMs),
      mayBeOpen: (endsMs - startsMs) / MS_PER_HOUR > LONG_WINDOW_HOURS,
    });
  }
  return found;
}

/**
 * Whether a route should go round a closure it runs along: the whole road is shut (a lane closure only slows the driver) and it
 * is shut when the driver gets there. A long-running scheme is left to the warning on the route screen, as it may be open.
 */
export function mustAvoid(closure: ClosureOnRoute): boolean {
  return closure.closure.kind === 'full' && !closure.mayBeOpen;
}

/** How many hours ahead of leaving a closure may start and still be in force when a drive of `durationMin` gets to it. */
export function lookAheadHours(durationMin: number): number {
  const minutes = durationMin * (1 + ARRIVAL_MARGIN_SHARE) + ARRIVAL_MARGIN_MIN;
  return Math.max(1, Math.ceil(minutes / 60));
}

/** What the driver is told when a route was sent round a closure, in the list of what was avoided. */
export function describeAvoidedClosure(closure: ClosureCandidate): AvoidedRestriction {
  return { description: `Road closure avoided: ${closure.description}` };
}
