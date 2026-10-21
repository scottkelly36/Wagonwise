import type { GeoLine } from '../../domain/geo.js';
import type { SpeedZone } from '../../domain/speed-zone.js';

/**
 * Reads the speed limits along a planned route from the map data. Supplied by `infrastructure/` (the routing engine's
 * own map). Never fails the caller: when the limits cannot be read it returns none, and the driver sees no signs.
 */
export interface SpeedLimitSource {
  zonesAlong(route: GeoLine): Promise<SpeedZone[]>;
}
