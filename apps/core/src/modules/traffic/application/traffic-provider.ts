import type { BoundingBox, FlowReading, GeoPoint, TrafficIncident } from '../domain/traffic.js';

/**
 * The provider turned a call down because of the account, not the request: a key it will not accept (401, 403) or a limit it has hit
 * (429, or 403 "not enough credits"). Trying again straight away only adds refused calls, so the service stops asking for a while.
 */
export class ProviderRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Where traffic data comes from (TomTom in production, a fake in tests). Swappable: nothing outside
 *  `infrastructure/` knows the provider. */
export interface TrafficProvider {
  /** Flow on the road nearest the point; undefined when the provider has no road there. */
  flowAt(point: GeoPoint): Promise<FlowReading | undefined>;
  incidentsIn(box: BoundingBox): Promise<TrafficIncident[]>;
}
