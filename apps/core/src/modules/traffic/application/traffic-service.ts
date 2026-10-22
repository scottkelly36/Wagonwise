import type { Clock } from '../../../shared/ports/clock.js';
import {
  extraSeconds,
  sampleAlong,
  snapToGrid,
  type BoundingBox,
  type FlowReading,
  type GeoPoint,
  type RouteSample,
  type TrafficIncident,
} from '../domain/traffic.js';
import type { TrafficProvider } from './traffic-provider.js';

export interface TrafficServiceOptions {
  /** How long a reading is reused. Traffic moves in minutes; this also keeps many drivers on one road to one call. */
  readonly cacheTtlMs: number;
  /** Provider calls allowed per UTC day. At the limit the service answers "unknown" rather than overspend. */
  readonly dailyRequestLimit: number;
  /** Distance between flow samples along a route. */
  readonly sampleSpacingM: number;
  /** The most flow samples taken for one route, so a long route cannot spend the day's allowance. */
  readonly maxSamplesPerRoute: number;
  /**
   * Told when a provider call fails or the day's allowance runs out, at most once every few minutes for each kind, so a broken key
   * or an outage shows up in the logs instead of quietly giving every route "no traffic".
   */
  readonly onProblem?:
    ((what: 'flow' | 'incidents' | 'limit', error?: unknown) => void) | undefined;
}

/** The same problem is reported at most this often. */
const PROBLEM_EVERY_MS = 5 * 60_000;

export interface RouteTraffic {
  /** Seconds added to the route by traffic, over its free-flow time. */
  readonly delaySeconds: number;
  /** Incidents in the box around the route. */
  readonly incidents: readonly TrafficIncident[];
  /** Share (0 to 1) of the route we got a reading for; below 1 the delay is a lower bound. */
  readonly coverage: number;
}

interface Cached<T> {
  readonly value: T;
  readonly at: number;
}

/**
 * Turns the provider's per-point readings into "how much slower is this route". Readings and incident
 * boxes are cached and snapped to a grid, and a daily cap guards the free allowance. Without a provider,
 * once the cap is reached, or when a call fails, it reports what it has and a lower coverage: traffic is a
 * hint for choosing between routes that are already safe, never something a route depends on.
 */
export class TrafficService {
  readonly #flow = new Map<string, Cached<FlowReading | undefined>>();
  readonly #incidents = new Map<string, Cached<TrafficIncident[]>>();
  #day = '';
  #used = 0;
  readonly #lastProblem = new Map<string, number>();

  constructor(
    private readonly provider: TrafficProvider | undefined,
    private readonly clock: Clock,
    private readonly options: TrafficServiceOptions,
  ) {}

  get enabled(): boolean {
    return this.provider !== undefined;
  }

  /** Provider calls made today (UTC), for logging. */
  get requestsToday(): number {
    this.#rollDay();
    return this.#used;
  }

  async delayAlong(line: readonly GeoPoint[]): Promise<RouteTraffic> {
    if (this.provider === undefined || line.length < 2) {
      return { delaySeconds: 0, incidents: [], coverage: 0 };
    }

    let delay = 0;
    let covered = 0;
    let total = 0;
    for (const { point, lengthM } of this.#thin(sampleAlong(line, this.options.sampleSpacingM))) {
      total += lengthM;
      const reading = await this.#flowAt(point);
      if (reading === undefined) continue;
      covered += lengthM;
      delay += extraSeconds(reading, lengthM);
    }
    return {
      delaySeconds: Math.round(delay),
      incidents: await this.#incidentsAlong(line),
      coverage: total === 0 ? 0 : covered / total,
    };
  }

  /** A route with too many samples is thinned, not cut short: each kept sample stands for its group's whole length. */
  #thin(samples: RouteSample[]): RouteSample[] {
    const max = this.options.maxSamplesPerRoute;
    if (samples.length <= max) return samples;
    const stride = Math.ceil(samples.length / max);
    const out: RouteSample[] = [];
    for (let i = 0; i < samples.length; i += stride) {
      const group = samples.slice(i, i + stride);
      out.push({
        point: (group[0] as RouteSample).point,
        lengthM: group.reduce((sum, s) => sum + s.lengthM, 0),
      });
    }
    return out;
  }

  async #flowAt(point: GeoPoint): Promise<FlowReading | undefined> {
    const snapped = snapToGrid(point);
    const key = `${snapped.lat},${snapped.lon}`;
    const hit = this.#flow.get(key);
    if (hit !== undefined && this.#fresh(hit)) return hit.value;
    const provider = this.provider;
    if (provider === undefined) return hit?.value;
    if (!this.#spend()) {
      this.#problem('limit');
      return hit?.value;
    }
    try {
      const value = await provider.flowAt(snapped);
      this.#flow.set(key, { value, at: this.clock.now().getTime() });
      return value;
    } catch (error) {
      this.#problem('flow', error);
      return hit?.value; // a stale reading beats none; the next call tries again
    }
  }

  async #incidentsAlong(line: readonly GeoPoint[]): Promise<TrafficIncident[]> {
    const provider = this.provider;
    if (provider === undefined) return [];
    const box = boxAround(line);
    const key = [box.minLat, box.minLon, box.maxLat, box.maxLon].join(',');
    const hit = this.#incidents.get(key);
    if (hit !== undefined && this.#fresh(hit)) return hit.value;
    if (!this.#spend()) {
      this.#problem('limit');
      return hit?.value ?? [];
    }
    try {
      const value = await provider.incidentsIn(box);
      this.#incidents.set(key, { value, at: this.clock.now().getTime() });
      return value;
    } catch (error) {
      this.#problem('incidents', error);
      return hit?.value ?? [];
    }
  }

  #problem(what: 'flow' | 'incidents' | 'limit', error?: unknown): void {
    const at = this.clock.now().getTime();
    const last = this.#lastProblem.get(what);
    if (last !== undefined && at - last < PROBLEM_EVERY_MS) return;
    this.#lastProblem.set(what, at);
    this.options.onProblem?.(what, error);
  }

  #fresh(entry: Cached<unknown>): boolean {
    return this.clock.now().getTime() - entry.at < this.options.cacheTtlMs;
  }

  #rollDay(): void {
    const day = this.clock.now().toISOString().slice(0, 10);
    if (day !== this.#day) {
      this.#day = day;
      this.#used = 0;
      this.#flow.clear();
      this.#incidents.clear();
    }
  }

  /** Reserves one provider call; false once the day's allowance is gone. */
  #spend(): boolean {
    this.#rollDay();
    if (this.#used >= this.options.dailyRequestLimit) return false;
    this.#used += 1;
    return true;
  }
}

/** A box around the route, snapped outward to 0.1 degrees so similar routes share a cache entry. */
function boxAround(line: readonly GeoPoint[]): BoundingBox {
  const lats = line.map((p) => p.lat);
  const lons = line.map((p) => p.lon);
  const down = (v: number): number => Number((Math.floor(v * 10) / 10).toFixed(1));
  const up = (v: number): number => Number((Math.ceil(v * 10) / 10).toFixed(1));
  return {
    minLat: down(Math.min(...lats)),
    minLon: down(Math.min(...lons)),
    maxLat: up(Math.max(...lats)),
    maxLon: up(Math.max(...lons)),
  };
}
