import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import { FUEL_MAX_AGE_DAYS, fuelTypeFor } from '../lib/fuel-details';
import { useFuelChoiceStore } from '../state/fuel-choice-store';
import * as fuelApi from './fuel';

/** The server's copy of the prices is replaced hourly, so asking more often than this finds nothing new. */
const NEARBY_FUEL_POLL_MS = 10 * 60_000;

/**
 * The cheapest stations around a point for the driver's fuel (diesel or petrol, `useFuelChoiceStore`) from prices reported within
 * the last week. Disabled until there is a point. `keepPrevious` keeps the last answer while a new map view loads, so the markers
 * do not blink as it is panned.
 */
export function useNearbyFuel(
  centre: { lat: number; lon: number } | undefined,
  radiusM: number,
  limit: number,
  keepPrevious = false,
) {
  const accessToken = useAccessToken();
  const fuelType = fuelTypeFor(useFuelChoiceStore((s) => s.choice));
  return useQuery({
    queryKey: ['nearby-fuel', centre, radiusM, limit, fuelType],
    queryFn: () =>
      fuelApi.findNearbyFuel(accessToken, {
        centre: centre ?? { lat: 0, lon: 0 },
        radiusM,
        fuelType,
        maxAgeDays: FUEL_MAX_AGE_DAYS,
        limit,
      }),
    enabled: centre !== undefined,
    refetchInterval: NEARBY_FUEL_POLL_MS,
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}
