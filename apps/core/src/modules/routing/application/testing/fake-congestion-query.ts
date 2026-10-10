import type { GeoPoint } from '../../domain/geo.js';
import type { CongestionQuery, CongestionWait } from '../ports/congestion-query.js';

/** Waits keyed by a rough test rule: `waits` answers every line, or `waitsFor` decides per line. */
export class FakeCongestionQuery implements CongestionQuery {
  waits: CongestionWait[] = [];
  waitsFor: ((line: readonly GeoPoint[]) => CongestionWait[]) | undefined;

  waitsNear(line: readonly GeoPoint[]): Promise<CongestionWait[]> {
    return Promise.resolve(this.waitsFor === undefined ? this.waits : this.waitsFor(line));
  }
}
