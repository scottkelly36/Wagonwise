import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';

/** Jobs the driver is out doing — mirrors core's `TRACKED_STATUSES` (jobs/domain/job.ts), which is
 *  what decides whether a position is accepted and served. */
const ON_THE_ROAD: readonly JobStatus[] = [
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
];

export function isOnTheRoad(status: JobStatus): boolean {
  return ON_THE_ROAD.includes(status);
}

/** The stop the driver is heading for: the pickup until the load is on, the delivery after. Undefined
 *  for a job without such a stop. */
export function nextStop(
  job: Pick<JobDto, 'status' | 'stops'>,
): JobDto['stops'][number] | undefined {
  const kind = job.status === 'accepted' || job.status === 'at_pickup' ? 'pickup' : 'delivery';
  return job.stops.find((stop) => stop.kind === kind);
}

export type Freshness = 'live' | 'stale' | 'lost';

export interface LastSeen {
  readonly label: string;
  readonly freshness: Freshness;
}

// The app reports every 30 s but only while it is open (foreground-only, P2-M6.1), so a phone in a
// pocket with the screen locked goes quiet. Under two minutes is a driver we are hearing from;
// beyond ten we are not claiming to know where they are.
const LIVE_MS = 2 * 60_000;
const STALE_MS = 10 * 60_000;

export function lastSeen(recordedAt: string, now: Date): LastSeen {
  const ageMs = Math.max(0, now.getTime() - new Date(recordedAt).getTime());
  const freshness: Freshness = ageMs < LIVE_MS ? 'live' : ageMs < STALE_MS ? 'stale' : 'lost';
  if (ageMs < 60_000) return { label: 'just now', freshness };
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return { label: `${minutes} min ago`, freshness };
  const hours = Math.floor(minutes / 60);
  return { label: hours < 24 ? `${hours} h ago` : 'over a day ago', freshness };
}

const MAPLIBRE_DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

/** Same choice as the driver app's `lib/map-style.ts`: MapTiler when there is a key, MapLibre's
 *  keyless demo style when there isn't, so the page works with no set-up at all. */
export function mapStyleUrl(maptilerApiKey: string | undefined): string {
  if (!maptilerApiKey) return MAPLIBRE_DEMO_STYLE_URL;
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerApiKey}`;
}
