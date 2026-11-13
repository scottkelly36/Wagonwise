/**
 * What a bridge, width or weight limit can sensibly be. No road in Britain is signed above about 5 m high, 5 m wide or 44 t, so a bigger number is a
 * mistake, usually a height in feet typed into the metres box (13.9 for 13 ft 9 in). Core treats such a number as no measurement (`usableLimit`), so it
 * would avoid every vehicle; staff are stopped from typing one in the first place. The same limits as core's.
 */
const MAX_PLAUSIBLE = { height: 7, width: 8, weight: 100 } as const;

export type MeasurementKind = keyof typeof MAX_PLAUSIBLE;

/** Why this text cannot be saved as a measurement, or `undefined` when it can. An empty box is fine: it leaves the measurement as it was. */
export function measurementProblem(kind: MeasurementKind, text: string): string | undefined {
  if (text.trim() === '') return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return 'Enter a number above zero.';
  if (value <= MAX_PLAUSIBLE[kind]) return undefined;
  if (kind === 'height') {
    return 'That is too high for a bridge. Heights are in metres, for example 4.2: 13 ft 9 in is 4.19.';
  }
  if (kind === 'width')
    return 'That is too wide for a road. Widths are in metres, for example 2.5.';
  return 'That is too heavy for a weight limit. Weights are in tonnes, for example 7.5.';
}
