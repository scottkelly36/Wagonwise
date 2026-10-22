import type { SpeedZoneDto } from '@wagonwise/contracts/routing';

import { OFF_ROUTE_M } from './turn-guidance';

/** What the sign shows: a number, or the national speed limit. */
export type SpeedLimitSign =
  { readonly kind: 'limit'; readonly mph: number } | { readonly kind: 'national' };

/**
 * The sign for where the driver is along the route, or nothing when no limit is known there (the stretches between zones),
 * or the driver has left the route, where the limits read for the route no longer apply.
 *
 * `traveledMetres` and `totalMetres` come from `routeProgress`; the zones are fractions of the route, so a small
 * difference between the server's length and the app's does not move a sign by more than a few metres.
 */
export function speedLimitHere(
  zones: readonly SpeedZoneDto[] | undefined,
  traveledMetres: number,
  totalMetres: number,
  offRouteMetres: number,
): SpeedLimitSign | undefined {
  if (!zones || zones.length === 0 || totalMetres <= 0 || offRouteMetres > OFF_ROUTE_M) {
    return undefined;
  }
  const fraction = Math.min(1, Math.max(0, traveledMetres / totalMetres));
  const zone = zones.find((z) => fraction >= z.from && fraction < z.to);
  if (!zone) return undefined;
  return zone.limitMph === undefined ? { kind: 'national' } : { kind: 'limit', mph: zone.limitMph };
}

/** For a screen reader. */
export function speedLimitLabel(sign: SpeedLimitSign): string {
  return sign.kind === 'national'
    ? 'National speed limit applies. Check the signs.'
    : `Speed limit ${sign.mph} miles per hour. Check the signs.`;
}
