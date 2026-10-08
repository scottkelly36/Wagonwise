export type PointEnd = 'origin' | 'destination';
export type FromMode = 'here' | 'search' | 'map';
export type ToMode = 'search' | 'map';

/**
 * Which end of the route a tap on the map sets. The end that is on Map; with both on Map, the one
 * the driver chose last; with neither, the destination (which then goes onto Map too).
 */
export function mapTapTarget(from: FromMode, to: ToMode, lastChosen: PointEnd): PointEnd {
  if (from === 'map' && to === 'map') return lastChosen;
  return from === 'map' ? 'origin' : 'destination';
}

/**
 * Which end the next map tap sets, once `tapped` has just been set. With both ends on Map: after the
 * start, on to the destination if it is not set yet (otherwise taps keep moving the start until the
 * driver picks the other end); after the destination, back to the start if that is not set yet.
 */
export function targetAfterTap(
  tapped: PointEnd,
  from: FromMode,
  to: ToMode,
  otherIsSet: boolean,
  current: PointEnd,
): PointEnd {
  if (tapped === 'origin') return to === 'map' && !otherIsSet ? 'destination' : current;
  return from === 'map' && !otherIsSet ? 'origin' : current;
}
