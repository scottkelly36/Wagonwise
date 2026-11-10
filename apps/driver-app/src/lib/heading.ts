/** Above this speed (about 3 mph) the phone's GPS course is trusted over its compass: at walking
 *  pace and below GPS course jumps around, and a moving vehicle's course is exactly where it faces. */
const MOVING_MPS = 1.5;

/** Once moving, it counts as stopped only below this (about 1.8 mph). A lorry creeping in a queue, or a
 *  GPS speed that wanders around one threshold, would otherwise swap between the GPS course and the
 *  compass every fix, and the map would swing between the two. */
const STOPPED_MPS = 0.8;

export interface HeadingInputs {
  /** The GPS course in degrees clockwise from north, as the phone reports it. Negative or missing
   *  means "no course". */
  readonly gpsHeadingDeg: number | null | undefined;
  readonly speedMps: number | null | undefined;
  /** The compass heading in degrees clockwise from north, if the phone has one. */
  readonly compassDeg: number | null | undefined;
  /** Whether the vehicle counts as moving, from `isMoving` so it carries a margin. When left out it is
   *  worked out from the speed alone, with a single threshold. */
  readonly moving?: boolean;
}

function valid(deg: number | null | undefined): deg is number {
  return deg !== null && deg !== undefined && Number.isFinite(deg) && deg >= 0;
}

function wrapped(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/**
 * Whether the vehicle is moving, with a margin so it does not flicker: it starts moving at 1.5 m/s and
 * only counts as stopped again below 0.8 m/s. A missing speed leaves it as it was.
 */
export function isMoving(wasMoving: boolean, speedMps: number | null | undefined): boolean {
  if (typeof speedMps !== 'number' || !Number.isFinite(speedMps)) return wasMoving;
  return wasMoving ? speedMps >= STOPPED_MPS : speedMps >= MOVING_MPS;
}

export interface Facing {
  readonly degrees: number;
  /** Where it came from: the GPS course is steady, a compass is not, so the two are held to different
   *  standards before the map is turned. */
  readonly source: 'gps' | 'compass';
}

/**
 * Which way the driver is facing, and what that was read from: the GPS course while moving, the compass
 * when stopped or slow (so the arrow still turns as the phone is turned), and nothing if neither is
 * available. Degrees clockwise from north, 0 up to 359.
 */
export function facingFrom(inputs: HeadingInputs): Facing | undefined {
  const moving =
    inputs.moving ?? (typeof inputs.speedMps === 'number' && inputs.speedMps >= MOVING_MPS);
  if (moving && valid(inputs.gpsHeadingDeg)) {
    return { degrees: wrapped(inputs.gpsHeadingDeg), source: 'gps' };
  }
  if (valid(inputs.compassDeg)) return { degrees: wrapped(inputs.compassDeg), source: 'compass' };
  return undefined;
}

/** `facingFrom` without the source. Degrees clockwise from north, 0 up to 359. */
export function facingDegrees(inputs: HeadingInputs): number | undefined {
  return facingFrom(inputs)?.degrees;
}

/**
 * Folds a new compass reading into a running one, so a compass that shakes by tens of degrees (a phone
 * on a dash in a steel cab, near a speaker or a charger) settles on where it is really pointing. It
 * takes the short way round, so 359 and 1 average to 0, not 180. Returns the reading as it is, wrapped
 * to 0 up to 360, when there is no running value yet. `weight` is how much of the new reading is taken.
 */
export function smoothDegrees(
  previous: number | null | undefined,
  reading: number,
  weight = 0.1,
): number {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) {
    return ((reading % 360) + 360) % 360;
  }
  const shortWay = ((reading - previous + 540) % 360) - 180;
  return (((previous + shortWay * weight) % 360) + 360) % 360;
}

/** Whether the arrow has turned enough to be worth redrawing: a few degrees of compass jitter
 *  should not re-render the map several times a second. Handles the 359 to 0 wrap. */
export function headingChangedEnough(
  previous: number | undefined,
  next: number | undefined,
  thresholdDeg = 5,
): boolean {
  if (previous === undefined || next === undefined) return previous !== next;
  const diff = Math.abs(previous - next) % 360;
  return Math.min(diff, 360 - diff) >= thresholdDeg;
}
