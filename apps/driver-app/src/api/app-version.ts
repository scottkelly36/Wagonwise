import {
  appVersionResponseSchema,
  type AppVersionResponse,
} from '@wagonwise/contracts/app-version';

import { requestJson, throwUnlessSuccess } from './http';

/** What the server says about new builds. Needs no sign-in. An empty answer means there is nothing to say. */
export async function getAppVersionInfo(): Promise<AppVersionResponse> {
  const { status, json } = await requestJson('GET', '/app/version');
  throwUnlessSuccess(status, json, [200]);
  return appVersionResponseSchema.parse(json);
}
