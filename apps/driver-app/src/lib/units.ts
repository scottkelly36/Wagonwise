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

/** e.g. 3.5 -> "3.5m (11'6\")" — the exact alongside-format the design doc's screen table asks
 *  for. `undefined`/non-positive input (still being typed, or genuinely invalid) shows nothing
 *  rather than a nonsense conversion like "0'0"". */
export function formatHeightWithFeetInches(heightM: number | undefined): string {
  if (heightM === undefined || !Number.isFinite(heightM) || heightM <= 0) {
    return '';
  }
  return `${heightM}m (${metresToFeetInches(heightM)})`;
}
