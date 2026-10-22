import type { GeoPoint } from './geo.js';

/** How close a camera must be to the route's line to count as on it. Tight on purpose: a camera on the other carriageway of
 *  a dual road is 15 to 30 m away and is not the driver's. */
export const CAMERA_ON_ROUTE_RADIUS_M = 12;

export type RouteCameraKind = 'fixed' | 'average' | 'red_light';

/** A camera on the driver's route. Mobile cameras are not in the map data, and the map is not complete. */
export interface RouteCamera {
  readonly id: string;
  readonly location: GeoPoint;
  readonly kind: RouteCameraKind;
  readonly maxspeedMph: number | undefined;
}
