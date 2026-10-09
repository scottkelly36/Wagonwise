import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Area, Row, Tile } from '../lib/home';

/** A row of attention tiles. A tile is a link to the page that deals with it; quiet at zero, amber or red when not. */
export function HomeTiles({ tiles, loading }: { tiles: readonly Tile[]; loading: boolean }) {
  return (
    <div className="home-tiles">
      {tiles.map((tile) => (
        <Link key={tile.key} to={tile.to} className={`home-tile tone-${tile.tone}`}>
          <span className="home-tile-label">
            <span className="home-dot" data-area={tile.area} aria-hidden="true" />
            {tile.label}
          </span>
          <span className="home-tile-value">{loading ? '…' : tile.value}</span>
          <span className="home-tile-sub">{loading ? ' ' : tile.sub}</span>
        </Link>
      ))}
    </div>
  );
}

/** A card with a coloured dot by its title and a link to where it leads. */
export function HomePanel({
  title,
  area,
  to,
  linkLabel,
  children,
}: {
  title: string;
  area: Area;
  to: string;
  linkLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="home-panel">
      <h2>
        <span className="home-dot" data-area={area} aria-hidden="true" />
        {title}
      </h2>
      {children}
      <Link to={to} className="home-link">
        {linkLabel}
      </Link>
    </section>
  );
}

/** Label on the left, figure on the right, coloured by tone. */
export function HomeRows({ rows }: { rows: readonly Row[] }) {
  return (
    <div>
      {rows.map((row) => (
        <div key={row.label} className="home-row">
          <span>{row.label}</span>
          <span className={`tone-${row.tone}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** What to say while something loads, or when it has nothing to show. */
export function HomeNote({ children }: { children: ReactNode }) {
  return <p className="muted home-note">{children}</p>;
}
