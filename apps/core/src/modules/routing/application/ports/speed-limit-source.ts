import type { GeoLine } from '../../domain/geo.js';
import type { RoadFeatures } from '../../domain/speed-zone.js';

/**
 * Reads the speed limits, and which parts are on a bridge, along a planned route from the map data. Supplied by `infrastructure/` (the routing engine's
 * own map). Never fails the caller: when the limits cannot be read it returns none, and the driver sees no signs and no bridge is ruled out.
 */
export interface SpeedLimitSource {
  featuresAlong(route: GeoLine): Promise<RoadFeatures>;
}
