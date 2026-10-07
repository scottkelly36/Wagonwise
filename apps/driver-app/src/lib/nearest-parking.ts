import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';

import type { MapPoint } from '../components/route-map';
import { distanceMetres } from './geo-distance';

export interface RankedParkingSpot {
  readonly spot: SafeParkingSpotDto;
  /** Straight-line distance from the driver, in metres. */
  readonly distanceM: number;
}

/** How many spots the list offers: enough to choose from, few enough that a drive time can be asked
 *  for each. */
export const NEAREST_PARKING_COUNT = 5;

/** The spots nearest the driver as the crow flies, nearest first. The drive time is worked out
 *  afterwards for just these, so the road distance can reorder them. */
export function nearestParkingSpots(
  spots: readonly SafeParkingSpotDto[],
  from: MapPoint,
  count: number = NEAREST_PARKING_COUNT,
): RankedParkingSpot[] {
  return spots
    .map((spot) => ({ spot, distanceM: distanceMetres(from, spot.location) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, count);
}
