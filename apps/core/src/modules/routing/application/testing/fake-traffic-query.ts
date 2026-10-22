import type { GeoPoint } from '../../domain/geo.js';
import type { RouteTrafficDelay, TrafficQuery } from '../ports/traffic-query.js';

/** No traffic data by default; a test sets `delayFor` to give some lines a delay. */
export class FakeTrafficQuery implements TrafficQuery {
  enabled = true;
  delayFor: ((line: readonly GeoPoint[]) => RouteTrafficDelay) | undefined;

  delayAlong(line: readonly GeoPoint[]): Promise<RouteTrafficDelay> {
    return Promise.resolve(
      this.delayFor === undefined ? { delaySeconds: 0, coverage: 0 } : this.delayFor(line),
    );
  }
}
