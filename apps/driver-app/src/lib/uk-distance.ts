import type { DistanceUnit } from './units';

const METRES_PER_YARD = 0.9144;
const METRES_PER_MILE = 1609.344;

/** Under this many yards a distance is read in yards; at or over it, in miles. UK road signs do the
 *  same, and "800 yards" sounds odd next to "half a mile". */
const YARDS_UP_TO = 800;

/** The same cut-over in metric: under this many metres a distance is read in metres, at or over it, in kilometres. */
const METRES_UP_TO = 1000;
/** Spoken, the cut-over is a little lower, so that "975 metres" does not round up to "1000 metres". */
const SPOKEN_METRES_UP_TO = 950;

const QUARTER_MILES: Readonly<Record<number, string>> = {
  1: 'a quarter of a mile',
  2: 'half a mile',
  3: 'three quarters of a mile',
  4: '1 mile',
  5: '1 and a quarter miles',
  6: '1 and a half miles',
  7: '1 and three quarters miles',
};

function spokenKilometres(metres: number): string {
  const km = metres / 1000;
  // Halves of a kilometre up to 5 km, then whole kilometres.
  const rounded = km < 5 ? Math.round(km * 2) / 2 : Math.round(km);
  return rounded === 1 ? '1 kilometre' : `${rounded} kilometres`;
}

/**
 * How far ahead a turn is, as it is said aloud. In miles (the UK road-sign way): yards to the nearest 50
 * ("300 yards"), then miles to the nearest quarter ("half a mile", "1 and a half miles"), then whole
 * miles ("3 miles"). In kilometres: metres to the nearest 50 ("300 metres"), then halves of a kilometre
 * ("1 and a half"), then whole kilometres. Never "feet", which is what the routing engine's own wording uses.
 */
export function spokenDistance(metres: number, unit: DistanceUnit): string {
  if (unit === 'km') {
    if (metres < SPOKEN_METRES_UP_TO) return `${Math.max(50, Math.round(metres / 50) * 50)} metres`;
    return spokenKilometres(metres);
  }
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
 * The same distance for the turn card, short and exact enough to glance at. In miles: yards to the nearest 10
 * (nearest 50 from 200), then miles to one decimal ("0.6 mi"), then whole miles from 10. In kilometres: metres
 * to the nearest 10 (nearest 50 from 200), then kilometres to one decimal ("1.3 km"), then whole kilometres from 10.
 */
export function shortDistance(metres: number, unit: DistanceUnit): string {
  if (unit === 'km') {
    if (metres < METRES_UP_TO) {
      const step = metres < 200 ? 10 : 50;
      return `${Math.max(step, Math.round(metres / step) * step)} m`;
    }
    const km = metres / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
  }
  const yards = metres / METRES_PER_YARD;
  if (yards < YARDS_UP_TO) {
    const step = yards < 200 ? 10 : 50;
    const rounded = Math.max(step, Math.round(yards / step) * step);
    return `${rounded} yd`;
  }
  const miles = metres / METRES_PER_MILE;
  return miles >= 10 ? `${Math.round(miles)} mi` : `${miles.toFixed(1)} mi`;
}
