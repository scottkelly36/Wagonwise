import type { Tile } from './home';

/** One thing that needs a person, as the bell in the top bar lists it. */
export interface Alert {
  readonly key: string;
  /** What is wrong, in a line. */
  readonly title: string;
  /** More about it, when there is more to say. */
  readonly detail: string | undefined;
  /** Red when a vehicle or driver must stop, amber otherwise. */
  readonly tone: 'warn' | 'bad';
  /** The page that deals with it. */
  readonly to: string;
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** How each Overview tile reads as an alert. A tile with no entry here is left out of the bell. */
const WORDING: Readonly<Record<string, (n: number) => string>> = {
  unassigned: (n) => `${count(n, 'job', 'jobs')} without a driver`,
  'not-opened': (n) => `${count(n, 'job', 'jobs')} not opened by the driver yet`,
  'do-not-drive': (n) => `${count(n, 'vehicle', 'vehicles')} marked do not drive`,
  maintenance: (n) => `${count(n, 'maintenance item', 'maintenance items')} overdue`,
};

/**
 * The alerts for the bell: every Overview tile that is not quiet, then each driver short of driving hours. Red ones come
 * first. The same facts as the Overview, so the two never disagree.
 */
export function alertsFrom(tiles: readonly Tile[], lowHours: readonly string[]): Alert[] {
  const fromTiles = tiles.flatMap((tile): Alert[] => {
    const words = WORDING[tile.key];
    const n = Number(tile.value);
    if (tile.tone === 'quiet' || words === undefined || !Number.isFinite(n)) return [];
    return [
      {
        key: tile.key,
        title: words(n),
        detail: tile.sub,
        tone: tile.tone === 'bad' ? 'bad' : 'warn',
        to: tile.to,
      },
    ];
  });
  const fromHours = lowHours.map((text, i): Alert => ({
    key: `hours-${i}`,
    title: 'Driving hours running low',
    detail: text,
    tone: 'bad',
    to: '/fleet/live-trips',
  }));
  return [...fromTiles, ...fromHours].sort(
    (a, b) => Number(b.tone === 'bad') - Number(a.tone === 'bad'),
  );
}
