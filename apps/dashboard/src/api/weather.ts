import {
  weatherWarningsWithAreasResponseSchema,
  type WeatherWarningsWithAreasResponse,
} from '@wagonwise/contracts/weather';

import { requestJson, throwUnlessSuccess } from './http';

/** Met Office warnings in force or starting within a day, with their areas, for the banner and the map. */
export async function listWeatherWarnings(
  accessToken: string,
): Promise<WeatherWarningsWithAreasResponse> {
  const { status, json } = await requestJson('GET', '/staff/weather/warnings', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return weatherWarningsWithAreasResponseSchema.parse(json);
}
