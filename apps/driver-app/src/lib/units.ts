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
