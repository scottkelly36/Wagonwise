import type { JobDto } from '@wagonwise/contracts/jobs';
import { localDay, type Tile, type Tone } from './home';
import { jobStatusText } from './job-text';

const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** Red ones first, then amber, then the quiet ones, each group keeping its order, so what needs a person is on the left. */
export function byUrgency(tiles: readonly Tile[]): Tile[] {
  const rank = (t: Tile): number => (t.tone === 'bad' ? 0 : t.tone === 'warn' ? 1 : 2);
  return tiles
    .map((tile, i) => ({ tile, i }))
    .sort((a, b) => rank(a.tile) - rank(b.tile) || a.i - b.i)
    .map(({ tile }) => tile);
}

/** The words for each tile when it is part of the summary line. */
const TILE_WORDS: Readonly<Record<string, (n: number) => string>> = {
  'do-not-drive': (n) => `${n} ${plural(n, 'vehicle')} marked do not drive`,
  unassigned: (n) => `${n} ${plural(n, 'job')} without a driver`,
  'not-opened': (n) => `${n} ${plural(n, 'job')} not opened by the driver yet`,
  maintenance: (n) => `${n} maintenance ${plural(n, 'item')} overdue`,
};

/**
 * One sentence under the greeting: what needs a person, worst first, or that nothing does. At most three things are named
 * and the rest are counted. `late` is jobs running late and `lowHours` is drivers short of driving hours.
 */
export function managerSummary(input: {
  readonly tiles: readonly Tile[];
  readonly late: number;
  readonly lowHours: number;
}): string {
  const fromTile = (key: string): string[] => {
    const tile = input.tiles.find((t) => t.key === key);
    const words = TILE_WORDS[key];
    const n = tile === undefined ? 0 : Number(tile.value);
    return tile === undefined || tile.tone === 'quiet' || words === undefined || !(n > 0)
      ? []
      : [words(n)];
  };
  const parts = [
    ...fromTile('do-not-drive'),
    ...(input.late > 0 ? [`${input.late} ${plural(input.late, 'job')} running late`] : []),
    ...(input.lowHours > 0
      ? [`${input.lowHours} ${plural(input.lowHours, 'driver')} short of driving hours`]
      : []),
    ...fromTile('unassigned'),
    ...fromTile('not-opened'),
    ...fromTile('maintenance'),
  ];
  if (parts.length === 0) return 'All clear: nothing needs you right now.';

  const named = parts.slice(0, 3);
  const rest = parts.length - named.length;
  const last = named[named.length - 1] ?? '';
  const list = named.length === 1 ? last : `${named.slice(0, -1).join(', ')} and ${last}`;
  return rest > 0 ? `${list}, and ${rest} more to look at.` : `${list}.`;
}

export interface TodayRow {
  readonly jobId: string;
  readonly reference: string;
  readonly route: string;
  /** Status and, when known, the time it is due, in words. */
  readonly status: string;
  readonly tone: Tone;
}

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The jobs planned for or due today (not cancelled or failed): those still to do by due time, then those delivered. */
export function todaysJobs(
  jobs: readonly JobDto[],
  now: Date,
  limit = 6,
): { rows: TodayRow[]; total: number; delivered: number; more: number } {
  const today = localDay(now);
  const isToday = (iso: string | undefined): boolean =>
    iso !== undefined && localDay(new Date(iso)) === today;
  const mine = jobs
    .filter((j) => j.status !== 'cancelled' && j.status !== 'failed')
    .filter((j) => isToday(j.dueBy) || isToday(j.plannedStart));
  const stamp = (j: JobDto): number =>
    new Date(j.dueBy ?? j.plannedStart ?? now.toISOString()).getTime();
  const ordered = [...mine].sort(
    (a, b) =>
      Number(a.status === 'delivered') - Number(b.status === 'delivered') || stamp(a) - stamp(b),
  );

  const rows = ordered.slice(0, limit).map((job): TodayRow => {
    const first = job.stops[0]?.name;
    const last = job.stops[job.stops.length - 1]?.name;
    const route =
      first === undefined || last === undefined || job.stops.length < 2
        ? (last ?? '')
        : `${first} → ${last}`;
    const delivered = job.status === 'delivered';
    const draft = job.status === 'draft';
    const due = delivered || job.dueBy === undefined ? undefined : `due ${clock(job.dueBy)}`;
    return {
      jobId: job.id,
      reference: job.reference,
      route,
      status: draft ? 'Needs a driver' : [jobStatusText(job), due].filter(Boolean).join(' · '),
      tone: delivered ? 'good' : draft ? 'warn' : 'quiet',
    };
  });
  return {
    rows,
    total: mine.length,
    delivered: mine.filter((j) => j.status === 'delivered').length,
    more: Math.max(0, mine.length - rows.length),
  };
}
