import { warningsAtResponseSchema, type WeatherWarningDto } from '@wagonwise/contracts/weather';

import { requestJson, throwUnlessSuccess } from './http';

/** The Met Office warnings in force, or starting within a day, over a point. */
export async function warningsAt(
  accessToken: string,
  location: { readonly lat: number; readonly lon: number },
): Promise<WeatherWarningDto[]> {
  const { status, json } = await requestJson('POST', '/weather/warnings/at', {
    body: { location },
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return warningsAtResponseSchema.parse(json).warnings;
}
