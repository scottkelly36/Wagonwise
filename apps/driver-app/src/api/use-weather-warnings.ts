import { useQuery } from '@tanstack/react-query';
import type { WeatherWarningDto } from '@wagonwise/contracts/weather';

import { useAccessToken } from '../hooks/use-access-token';
import { roundedForWeather } from '../lib/weather';
import * as weatherApi from './weather';

const REFRESH_MS = 10 * 60_000;

/**
 * The weather warnings over where the driver is. Asked about a position rounded to about 10 km, so the
 * answer is not asked for again on every metre driven; refreshed every ten minutes. A failure (offline,
 * the Met Office feed not switched on) just means no badge: this is advice, never in the way.
 */
export function useWeatherWarnings(
  point: { readonly lat: number; readonly lon: number } | undefined,
): WeatherWarningDto[] {
  const accessToken = useAccessToken();
  const spot = point === undefined ? undefined : roundedForWeather(point);
  const query = useQuery({
    queryKey: ['weather-warnings', spot?.lat, spot?.lon],
    queryFn: () => weatherApi.warningsAt(accessToken, spot as { lat: number; lon: number }),
    enabled: spot !== undefined,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
    retry: false,
  });
  return query.data ?? [];
}
