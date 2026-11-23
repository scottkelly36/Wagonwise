import { heatOpacity } from '../../lib/charts';

export interface HeatRow {
  readonly key: string;
  readonly label: string;
  /** One cell per column: a share from 0 to 1, or null where it does not apply yet. */
  readonly cells: readonly (number | null)[];
  /** What each cell says; empty for a cell that does not apply. */
  readonly texts: readonly string[];
  readonly title?: string | undefined;
}

/**
 * A grid of shares filled in one blue, light to dark: the darker the cell the bigger the share. The figure is written in each cell, so the
 * colour is never the only way to read it.
 */
export function HeatGrid({
  label,
  columns,
  rows,
}: {
  label: string;
  columns: readonly string[];
  rows: readonly HeatRow[];
}) {
  return (
    <div
      className="heat"
      role="table"
      aria-label={label}
      style={{ gridTemplateColumns: `72px repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      <span role="columnheader" className="heat-head">
        Joined
      </span>
      {columns.map((c) => (
        <span key={c} role="columnheader" className="heat-head">
          {c}
        </span>
      ))}
      {rows.map((row) => (
        <div key={row.key} role="row" className="heat-row" title={row.title}>
          <span role="rowheader" className="heat-label">
            {row.label}
          </span>
          {columns.map((c, i) => {
            const share = row.cells[i] ?? null;
            const opacity = heatOpacity(share);
            return (
              <span key={c} role="cell" className={opacity > 0.55 ? 'heat-cell dark' : 'heat-cell'}>
                <span className="heat-fill" style={{ opacity }} />
                <span className="heat-text">{row.texts[i] ?? ''}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
