/** The smallest "nice" number (1, 2, 5 or 10 times a power of ten) that is at least `max`: the top of a chart's scale. 0 gives 1. */
export function niceCeil(max: number): number {
  if (!(max > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= max) return step * power;
  }
  return 10 * power;
}

/** Gridline values for a column chart: zero, the middle and the top of the nice scale (a whole number in the middle). */
export function yTicks(max: number): number[] {
  const top = niceCeil(max);
  if (top < 2) return [0, top];
  const middle = Math.round(top / 2);
  return middle === 0 || middle === top ? [0, top] : [0, middle, top];
}

/** A figure for an axis or a label: whole numbers in full under 10,000, then compact (12K). */
export function compact(n: number): string {
  if (Math.abs(n) < 10_000) return String(Math.round(n));
  if (Math.abs(n) < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** A column's height as a share (0 to 1) of the scale's top; a non-zero value never rounds away to nothing visible. */
export function columnShare(value: number, top: number): number {
  if (!(top > 0) || !(value > 0)) return 0;
  return Math.min(1, value / top);
}

/** The share of `part` in `whole` as 0 to 1, for a bar's length; 0 when there is no whole. */
export function barShare(part: number, whole: number): number {
  return whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
}

/** How strongly a heat-map cell is filled: its share of the scale (0 to 1) with a floor so a small value is still visible. */
export function heatOpacity(share: number | null): number {
  if (share === null) return 0;
  if (share <= 0) return 0.06;
  return Math.round((0.18 + 0.82 * Math.min(1, share)) * 100) / 100;
}
