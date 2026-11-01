import type { TaggedError } from '../../../shared/result.js';

export interface ClosurePoint {
  readonly lat: number;
  readonly lon: number;
}

/**
 * `full`: a whole carriageway, slip road or link road is shut. `lane`: one or more lanes (or the hard shoulder) are shut and the
 * road stays open. Narrowed lanes, speed limits and the like are not closures and are not kept.
 */
export const CLOSURE_KINDS = ['full', 'lane'] as const;
export type ClosureKind = (typeof CLOSURE_KINDS)[number];

/** `active`: in force now. `planned`: not yet. `suspended`: set up but paused (not in force right now, and may or may not resume). */
export const CLOSURE_STATUSES = ['active', 'planned', 'suspended'] as const;
export type ClosureStatus = (typeof CLOSURE_STATUSES)[number];

/**
 * One closure from National Highways' Road and Lane Closures feed (DATEX II), as this module needs it. A closure is one record of
 * the feed; a roadworks scheme (a "situation") can have several. Dates are the whole window the scheme says it may apply: the feed
 * gives a start and an end, not which nights inside it.
 */
export interface Closure {
  /** The feed's own id for the record. It stays the same as the scheme is updated. */
  readonly id: string;
  /** The scheme this closure belongs to. */
  readonly situationId: string;
  readonly kind: ClosureKind;
  readonly status: ClosureStatus;
  /** "M56", "A1(M)". Absent when the feed does not say. */
  readonly road: string | undefined;
  /** The feed's compass word: "northBound", "eastBound", "inboundTowardsTown" and so on. */
  readonly direction: string | undefined;
  /** What National Highways says to the public ("M56 eastbound between J7 and J6, carriageway closure"). */
  readonly description: string;
  /** Where it is, in words ("M56 J7 eastbound access from A556/A56"). */
  readonly locationText: string | undefined;
  /** Why: the feed's own word ("roadworks", "maintenanceWork", "treeAndVegetationCuttingWork"…). */
  readonly cause: string | undefined;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** How many lanes are shut, counting the hard shoulder when it is one of them. 0 for most full closures, which list no lanes. */
  readonly lanesClosed: number;
  /** Where to draw it: the middle of the first line. */
  readonly position: ClosurePoint;
  /** Where it runs: one or more lines of points, as National Highways draws them. */
  readonly lines: readonly (readonly ClosurePoint[])[];
  /** When National Highways last changed the record. */
  readonly updatedAt: Date;
}

/** A lane closure longer than this is a long-running scheme (months of works), not news a driver needs on the map. */
export const MAX_LANE_CLOSURE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a closure is worth keeping and showing. A full closure always is. A lane closure only when it is short: the feed has
 * hundreds of lane closures running for months (about half run more than two weeks), which would bury the closures that matter.
 */
export function isWorthKeeping(closure: Pick<Closure, 'kind' | 'startsAt' | 'endsAt'>): boolean {
  if (closure.kind === 'full') return true;
  return closure.endsAt.getTime() - closure.startsAt.getTime() <= MAX_LANE_CLOSURE_DAYS * DAY_MS;
}

/** The middle vertex of a line: a point that lies on the road, unlike the average of its ends. */
export function middleOf(line: readonly ClosurePoint[]): ClosurePoint | undefined {
  return line[Math.floor(line.length / 2)];
}

export interface NearbyClosuresQuery {
  readonly centre: ClosurePoint;
  readonly radiusM: number;
  /** Closures that have ended by this time are left out. */
  readonly now: Date;
  /** Closures that start after this time are left out (nothing a driver needs to see yet). */
  readonly startsBefore: Date;
  readonly limit: number;
}

export interface NearbyClosure {
  readonly closure: Closure;
  /** Straight-line metres from the centre to the nearest point of the closure's line. */
  readonly distanceM: number;
}

export interface NearbyClosures {
  readonly closures: readonly NearbyClosure[];
  /** When the copy was last replaced; undefined before the first refresh. */
  readonly refreshedAt: Date | undefined;
}

/** The service could not be reached or answered with something that is not a closures feed. `status` is the HTTP status, if one came. */
export interface ClosureSourceUnavailable extends TaggedError<'ClosureSourceUnavailable'> {
  readonly reason: 'not_configured' | 'unauthorised' | 'http_error' | 'unreadable' | 'unreachable';
  readonly status?: number | undefined;
}

/** A fetch that returned nothing when plenty is stored: more likely a broken answer than a quiet network. */
export interface SnapshotEmpty extends TaggedError<'SnapshotEmpty'> {
  readonly stored: number;
}
