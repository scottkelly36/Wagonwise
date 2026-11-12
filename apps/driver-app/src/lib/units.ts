// AGENTS.md: "Show bridge heights in metres and feet/inches — UK signage and driver habit use
// both." Height only (per the design doc's screen table) — width/length/weight stay metric-only,
// since UK road signage for those is metric-only too.
const METRES_PER_FOOT = 0.3048;
const INCHES_PER_FOOT = 12;

/** e.g. 3.5 -> "11'6\"" — rounds to the nearest inch, since that's the resolution UK bridge
 *  signage itself uses. */
export function metresToFeetInches(heightM: number): string {
  const totalInches = Math.round((heightM / METRES_PER_FOOT) * INCHES_PER_FOOT);
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = totalInches % INCHES_PER_FOOT;
  return `${feet}'${inches}"`;
}

const METRES_PER_INCH = 0.0254;

/** The unit a driver types a vehicle's height, width and length in. Weight stays in tonnes. */
export type LengthUnit = 'metres' | 'feet';

/** Feet and inches typed as text, to metres as text for the form's own parsing. Either box may be left empty (13 feet and nothing,
 *  or just 6 inches); both empty is an empty answer, and anything that is not a number or is negative gives "NaN" so the form
 *  says the measurement is not valid. Not rounded beyond four decimal places (a tenth of a millimetre). */
export function feetInchesToMetres(feet: string, inches: string): string {
  if (feet.trim() === '' && inches.trim() === '') return '';
  const f = feet.trim() === '' ? 0 : Number(feet.trim());
  const i = inches.trim() === '' ? 0 : Number(inches.trim());
  if (!Number.isFinite(f) || !Number.isFinite(i) || f < 0 || i < 0) return 'NaN';
  return String(Number(((f * INCHES_PER_FOOT + i) * METRES_PER_INCH).toFixed(4)));
}

/** Metres as text to whole feet and inches as text, for filling the two boxes. Rounded **up** to the next whole inch, never down:
 *  these are a vehicle's measurements and showing it smaller than it is would be the unsafe mistake. A value that is empty or not
 *  a positive number gives two empty boxes. */
export function metresToFeetInchesBoxes(metres: string): { feet: string; inches: string } {
  const m = Number(metres.trim());
  if (metres.trim() === '' || !Number.isFinite(m) || m <= 0) return { feet: '', inches: '' };
  // The small allowance stops a measurement that is exactly a whole number of inches coming back one inch bigger because of floating point.
  const totalInches = Math.ceil(m / METRES_PER_INCH - 1e-6);
  return {
    feet: String(Math.floor(totalInches / INCHES_PER_FOOT)),
    inches: String(totalInches % INCHES_PER_FOOT),
  };
}

/** e.g. 3.5 -> "3.5m (11'6\")" — the exact alongside-format the design doc's screen table asks
 *  for. `undefined`/non-positive input (still being typed, or genuinely invalid) shows nothing
 *  rather than a nonsense conversion like "0'0"". */
export function formatHeightWithFeetInches(heightM: number | undefined): string {
  if (heightM === undefined || !Number.isFinite(heightM) || heightM <= 0) {
    return '';
  }
  return `${heightM}m (${metresToFeetInches(heightM)})`;
}

/** How a driver reads the length of a route: miles until they choose kilometres. */
export type DistanceUnit = 'km' | 'miles';

/** How a driver reads and types a vehicle's fuel economy: litres per 100 km until they choose miles per gallon. */
export type FuelUnit = 'l100km' | 'mpg';

const KM_PER_MILE = 1.609344;
const LITRES_PER_IMPERIAL_GALLON = 4.54609;
/** Miles per gallon times litres per 100 km is always this: 100 L/100km is 2.8248 mpg, 10 L/100km is 28.248 mpg. */
const MPG_TIMES_L100KM = (100 * LITRES_PER_IMPERIAL_GALLON) / KM_PER_MILE;

/** A route's length, e.g. 29.702 -> "29.7 km", or "18.5 mi" in miles. */
export function formatRouteDistance(km: number, unit: DistanceUnit): string {
  return unit === 'miles' ? `${(km / KM_PER_MILE).toFixed(1)} mi` : `${km.toFixed(1)} km`;
}

/** Miles per gallon typed as text, to litres per 100 km as text for the form's own parsing. The gallon is the imperial (UK) gallon, which
 *  is what UK pumps and drivers mean, not the US one. Empty stays empty; anything that is not a positive number gives "NaN" so the
 *  form says the fuel consumption is not valid. Not rounded beyond four decimal places. */
export function mpgToL100km(mpg: string): string {
  if (mpg.trim() === '') return '';
  const value = Number(mpg.trim());
  if (!Number.isFinite(value) || value <= 0) return 'NaN';
  return String(Number((MPG_TIMES_L100KM / value).toFixed(4)));
}

/** Litres per 100 km as text to miles per gallon as text, to one decimal place, for filling the box. A value that is empty or not a
 *  positive number gives an empty box. */
export function l100kmToMpg(l100km: string): string {
  const value = Number(l100km.trim());
  if (l100km.trim() === '' || !Number.isFinite(value) || value <= 0) return '';
  return String(Number((MPG_TIMES_L100KM / value).toFixed(1)));
}

/** Miles per hour typed as text, to km/h as text for the form's own parsing: speeds are always typed in mph, like the road signs. Empty
 *  stays empty; anything that is not a positive number gives "NaN" so the form says the top speed is not valid. One decimal place. */
export function mphToKph(mph: string): string {
  if (mph.trim() === '') return '';
  const value = Number(mph.trim());
  if (!Number.isFinite(value) || value <= 0) return 'NaN';
  return String(Number((value * KM_PER_MILE).toFixed(1)));
}

/** km/h as text to miles per hour as text, to one decimal place (56 mph comes back as "56"), for filling the box. A value that is empty
 *  or not a positive number gives an empty box. */
export function kphToMph(kph: string): string {
  const value = Number(kph.trim());
  if (kph.trim() === '' || !Number.isFinite(value) || value <= 0) return '';
  return String(Number((value / KM_PER_MILE).toFixed(1)));
}

export const DISTANCE_UNIT_OPTIONS: readonly { key: DistanceUnit; label: string }[] = [
  { key: 'km', label: 'Kilometres' },
  { key: 'miles', label: 'Miles' },
];

export const FUEL_UNIT_OPTIONS: readonly { key: FuelUnit; label: string }[] = [
  { key: 'l100km', label: 'L/100 km' },
  { key: 'mpg', label: 'Miles per gallon' },
];
