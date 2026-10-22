import type { TrafficModule } from '../../traffic/api.js';
import type { RouteTrafficDelay, TrafficQuery } from '../application/ports/traffic-query.js';
import type { GeoPoint } from '../domain/geo.js';

/** Wraps `traffic`'s facade so routing never imports its types (AGENTS.md rule 7). */
export class TrafficQueryAdapter implements TrafficQuery {
  constructor(private readonly traffic: Pick<TrafficModule, 'delayAlong' | 'enabled'>) {}

  get enabled(): boolean {
    return this.traffic.enabled;
  }

  async delayAlong(line: readonly GeoPoint[]): Promise<RouteTrafficDelay> {
    const { delaySeconds, coverage } = await this.traffic.delayAlong(line);
    return { delaySeconds, coverage };
  }
}
