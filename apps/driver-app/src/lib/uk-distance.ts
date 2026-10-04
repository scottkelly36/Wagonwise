const METRES_PER_YARD = 0.9144;
const METRES_PER_MILE = 1609.344;

/** Under this many yards a distance is read in yards; at or over it, in miles. UK road signs do the
 *  same, and "800 yards" sounds odd next to "half a mile". */
const YARDS_UP_TO = 800;

const QUARTER_MILES: Readonly<Record<number, string>> = {
  1: 'a quarter of a mile',
  2: 'half a mile',
  3: 'three quarters of a mile',
  4: '1 mile',
  5: '1 and a quarter miles',
  6: '1 and a half miles',
  7: '1 and three quarters miles',
};

/**
 * How far ahead a turn is, as it is said aloud to a UK driver: yards to the nearest 50 ("300
 * yards"), then miles to the nearest quarter ("half a mile", "1 and a half miles"), then whole
 * miles ("3 miles"). Never "feet" or metres, which is what the routing engine's own wording uses.
 */
export function spokenDistance(metres: number): string {
  const yards = metres / METRES_PER_YARD;
  if (yards < YARDS_UP_TO) {
    const rounded = Math.max(50, Math.round(yards / 50) * 50);
    return `${rounded} yards`;
  }
  const quarters = Math.round(metres / METRES_PER_MILE / 0.25);
  if (quarters <= 7) return QUARTER_MILES[Math.max(1, quarters)] ?? '1 mile';
  const miles = Math.round(metres / METRES_PER_MILE);
  return `${miles} miles`;
}

/**
 * The same distance for the turn card, short and exact enough to glance at: yards to the nearest 10
 * (nearest 50 from 200), then miles to one decimal ("0.6 mi"), then whole miles from 10.
 */
export function shortDistance(metres: number): string {
  const yards = metres / METRES_PER_YARD;
  if (yards < YARDS_UP_TO) {
    const step = yards < 200 ? 10 : 50;
    const rounded = Math.max(step, Math.round(yards / step) * step);
    return `${rounded} yd`;
  }
  const miles = metres / METRES_PER_MILE;
  return miles >= 10 ? `${Math.round(miles)} mi` : `${miles.toFixed(1)} mi`;
}
