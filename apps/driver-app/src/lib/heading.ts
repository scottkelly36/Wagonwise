/** Above this speed (about 3 mph) the phone's GPS course is trusted over its compass: at walking
 *  pace and below GPS course jumps around, and a moving vehicle's course is exactly where it faces. */
const MOVING_MPS = 1.5;

export interface HeadingInputs {
  /** The GPS course in degrees clockwise from north, as the phone reports it. Negative or missing
   *  means "no course". */
  readonly gpsHeadingDeg: number | null | undefined;
  readonly speedMps: number | null | undefined;
  /** The compass heading in degrees clockwise from north, if the phone has one. */
  readonly compassDeg: number | null | undefined;
}

function valid(deg: number | null | undefined): deg is number {
  return deg !== null && deg !== undefined && Number.isFinite(deg) && deg >= 0;
}

/**
 * Which way the driver is facing, for the arrow on the map: the GPS course while moving, the
 * compass when stopped or slow (so the arrow still turns as the phone is turned), and nothing if
 * neither is available. Degrees clockwise from north, 0 up to 359.
 */
export function facingDegrees(inputs: HeadingInputs): number | undefined {
  const moving = typeof inputs.speedMps === 'number' && inputs.speedMps >= MOVING_MPS;
  const chosen =
    moving && valid(inputs.gpsHeadingDeg)
      ? inputs.gpsHeadingDeg
      : valid(inputs.compassDeg)
        ? inputs.compassDeg
        : undefined;
  return chosen === undefined ? undefined : ((Math.round(chosen) % 360) + 360) % 360;
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
