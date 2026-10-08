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
