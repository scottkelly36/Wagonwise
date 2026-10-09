import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';

import type { BreakEffect } from './breaks-in-journey';

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

/** The stop the driver is heading for or at. Undefined once there are none left, and for an accepted job that
 *  starts with a delivery: there is nowhere to go until they say they are loaded. Mirrors core's `nextStopFor`. */
export function nextStop(
  job: Pick<JobDto, 'status' | 'stops' | 'currentStop'>,
): JobDto['stops'][number] | undefined {
  const stop = job.stops[job.currentStop];
  if (stop === undefined) return undefined;
  if (job.status === 'accepted' && stop.kind === 'delivery') return undefined;
  return stop;
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

interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two points, in metres. As the crow flies — roads are longer, often
 *  much longer, so it is shown as "as the crow flies" and never turned into a time. */
export function straightLineMetres(a: LatLon, b: LatLon): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const METRES_PER_MILE = 1609.344;

/** Miles, which is what a UK haulage office and its drivers think in. */
export function formatMiles(metres: number): string {
  const miles = metres / METRES_PER_MILE;
  if (miles < 0.1) return 'under 0.1 mi';
  // Round first, then choose the format, so 9.99 reads "10 mi" and not "10.0 mi".
  const tenths = Math.round(miles * 10) / 10;
  return tenths < 10 ? `${tenths.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

/** "50 min", "1 h 20 min", "2 h". */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * What the list says about a vehicle's ETA. The estimate runs from the last place the vehicle was
 * heard from (`fromRecordedAt`), so the arrival time is that moment plus the journey — valid if the
 * driver has kept going since, which is why it is shown as "around". Once the position is old
 * enough to be lost, no clock time is claimed at all: the driver may have stopped, or the app may
 * simply be closed.
 */
export function etaText(
  eta: { readonly durationMin: number; readonly fromRecordedAt: string },
  freshness: Freshness,
  now: Date,
  breaks: BreakEffect = { kind: 'none' },
): string {
  const journey = formatDuration(eta.durationMin);
  if (freshness === 'lost') return `${journey} from where they were last seen`;
  if (breaks.kind === 'rest') {
    return `${journey} journey · the driver needs a rest before arriving, so not today`;
  }
  const extraMin = breaks.kind === 'breaks' ? breaks.extraMin : 0;
  const arrival = new Date(
    new Date(eta.fromRecordedAt).getTime() + (eta.durationMin + extraMin) * 60_000,
  );
  const withBreaks =
    breaks.kind === 'breaks'
      ? ` + ${breaks.breaks === 1 ? 'a break' : `${breaks.breaks} breaks`}`
      : '';
  if (arrival.getTime() <= now.getTime()) return `${journey} journey${withBreaks} · due about now`;
  const clock = arrival.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${journey} journey${withBreaks} · around ${clock}`;
}
