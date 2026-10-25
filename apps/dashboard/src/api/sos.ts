import { listSosResponseSchema, type SosAlertDto } from '@wagonwise/contracts/sos';

import { requestJson, throwUnlessSuccess } from './http';

/** The company's SOS alerts from its drivers: the open ones, or all. For the alert strip above every page. */
export async function listSos(accessToken: string, status: 'open' | 'all'): Promise<SosAlertDto[]> {
  const { status: code, json } = await requestJson('GET', `/staff/sos?status=${status}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(code, json, [200]);
  return listSosResponseSchema.parse(json).alerts;
}

/** Says an alert has been dealt with (needs the dispatch privilege; core checks). */
export async function resolveSos(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('POST', `/staff/sos/${id}/resolve`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
