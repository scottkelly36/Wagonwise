import {
  sendMyTachographFileRequestSchema,
  tachographMineResponseSchema,
  tachographStoredSchema,
  type SendMyTachographFileRequest,
  type TachographMineRow,
} from '@wagonwise/contracts/tachograph';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

/** Each company the driver drives for: whether it takes card files from the app, and the day of the latest file sent to it. */
export async function getMyTachographCompanies(accessToken: string): Promise<TachographMineRow[]> {
  const { status, json } = await requestJson('GET', '/tachograph/mine', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return tachographMineResponseSchema.parse(json).companies;
}

/** Sends the driver's own card file to a company. `duplicate` means the company already held exactly this file. */
export async function sendMyTachographFile(
  accessToken: string,
  companyId: string,
  input: SendMyTachographFileRequest,
): Promise<{ duplicate: boolean }> {
  const body = sendMyTachographFileRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/tachograph/companies/${encodeURIComponent(companyId)}/files`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200, 201]);
  return tachographStoredSchema.parse(json);
}
