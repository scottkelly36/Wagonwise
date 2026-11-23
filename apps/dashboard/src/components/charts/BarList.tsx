import { barShare } from '../../lib/charts';

export interface BarRow {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  /** What to write at the end of the bar; the value itself when absent. */
  readonly text?: string | undefined;
  /** A second, quieter line under the label. */
  readonly note?: string | undefined;
}

/**
 * Horizontal bars with the name on the left and the figure at the tip, for a ranking or a funnel. The bar's length is `value` against
 * `whole` (the biggest value when not given). A row at zero keeps its name and a faint track, so "nobody opened this" is visible.
 */
export function BarList({
  label,
  rows,
  whole,
}: {
  label: string;
  rows: readonly BarRow[];
  whole?: number;
}) {
  const base = whole ?? Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="barlist" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} title={`${row.label}: ${row.text ?? row.value}`}>
          <span className="barlist-label">
            {row.label}
            {row.note === undefined ? null : <small>{row.note}</small>}
          </span>
          <span className="barlist-track" aria-hidden="true">
            <span
              className="barlist-fill"
              style={{ width: `${barShare(row.value, base) * 100}%` }}
            />
          </span>
          <span className="barlist-value">{row.text ?? row.value}</span>
        </li>
      ))}
    </ul>
  );
}
