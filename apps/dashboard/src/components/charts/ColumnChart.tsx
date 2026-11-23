import { useState } from 'react';
import { columnShare, compact, niceCeil, yTicks } from '../../lib/charts';

interface Point {
  readonly key: string;
  readonly count: number;
}

/**
 * Columns over time (a day or a week each): thin columns with a rounded top that grow from one baseline, a few recessive gridlines, the
 * peak and the latest figure labelled, a tooltip for every column on hover and on focus, and the same figures as a table underneath.
 * One series, so no legend: the card's title says what it is.
 */
export function ColumnChart({
  label,
  points,
  format,
  height = 120,
}: {
  label: string;
  points: readonly Point[];
  /** How a key (a day or the start of a week) is written. */
  format: (key: string) => string;
  height?: number;
}) {
  const [active, setActive] = useState<number | undefined>(undefined);
  const max = Math.max(0, ...points.map((p) => p.count));
  const top = niceCeil(max);
  const ticks = yTicks(max);
  const total = points.reduce((sum, p) => sum + p.count, 0);
  const last = points.length - 1;

  return (
    <div className="chart">
      <div className="chart-body" style={{ height }}>
        <div className="chart-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              {compact(t)}
            </span>
          ))}
        </div>
        <div
          className="chart-plot"
          role="img"
          aria-label={`${label}: ${points.map((p) => `${format(p.key)} ${p.count}`).join(', ')}`}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="chart-grid"
              style={{ bottom: `${(t / top) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="chart-columns">
            {points.map((p, i) => {
              const share = columnShare(p.count, top);
              const labelled = p.count > 0 && (i === last || p.count === max);
              return (
                <div
                  key={p.key}
                  className="chart-slot"
                  tabIndex={0}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(undefined)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(undefined)}
                >
                  {labelled && <span className="chart-value">{p.count}</span>}
                  <span
                    className={active === i ? 'chart-bar hot' : 'chart-bar'}
                    style={{
                      height: `${share * 100}%`,
                      minHeight: p.count > 0 ? 3 : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
          {active !== undefined && points[active] !== undefined && (
            <div
              className="chart-tip"
              role="status"
              style={{
                left: `${((active + 0.5) / points.length) * 100}%`,
                bottom: `calc(${columnShare(points[active].count, top) * 100}% + 22px)`,
              }}
            >
              <strong>{points[active].count}</strong>
              <span>{format(points[active].key)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="chart-foot">
        <span>{points[0] === undefined ? '' : format(points[0].key)}</span>
        <span>{total} in all</span>
        <span>{points[last] === undefined ? '' : format(points[last].key)}</span>
      </div>
      <details className="chart-table">
        <summary>Show as a table</summary>
        <table>
          <tbody>
            {points.map((p) => (
              <tr key={p.key}>
                <th scope="row">{format(p.key)}</th>
                <td>{p.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
