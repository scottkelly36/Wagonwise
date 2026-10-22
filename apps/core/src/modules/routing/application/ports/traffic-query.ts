import type { GeoPoint } from '../../domain/geo.js';

export interface RouteTrafficDelay {
  /** Seconds traffic adds to the line over its clear-road time. */
  readonly delaySeconds: number;
  /** Share (0 to 1) of the line the provider had a reading for. */
  readonly coverage: number;
  /** Where along the line (metres from its start) traffic is held up. Absent means none known. */
  readonly stretches?: readonly {
    readonly fromM: number;
    readonly toM: number;
    readonly level: 'slow' | 'heavy';
  }[];
}

/** Routing's own read-model port onto `traffic` (AGENTS.md rule 7). Never throws: no provider, a cap reached or
 *  a failed call all come back as low coverage. */
export interface TrafficQuery {
  /** Whether live traffic is switched on at all (a provider key is set). */
  readonly enabled: boolean;
  delayAlong(line: readonly GeoPoint[]): Promise<RouteTrafficDelay>;
}
