/** A full closure is red (a driver cannot get through); a lane closure is amber (they can, in the lanes left). As the hazard markers are. */
export const CLOSURE_FULL_COLOUR = '#F87171';
export const CLOSURE_LANE_COLOUR = '#F59E0B';

export function closureColour(kind: 'full' | 'lane'): string {
  return kind === 'full' ? CLOSURE_FULL_COLOUR : CLOSURE_LANE_COLOUR;
}
