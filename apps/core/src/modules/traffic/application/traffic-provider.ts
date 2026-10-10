import type { BoundingBox, FlowReading, GeoPoint, TrafficIncident } from '../domain/traffic.js';

/** Where traffic data comes from (TomTom in production, a fake in tests). Swappable: nothing outside
 *  `infrastructure/` knows the provider. */
export interface TrafficProvider {
  /** Flow on the road nearest the point; undefined when the provider has no road there. */
  flowAt(point: GeoPoint): Promise<FlowReading | undefined>;
  incidentsIn(box: BoundingBox): Promise<TrafficIncident[]>;
}
