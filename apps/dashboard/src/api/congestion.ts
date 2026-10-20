import {
  clearExpiredCongestionResponseSchema,
  listStaffCongestionResponseSchema,
  type ListStaffCongestionResponse,
} from '@wagonwise/contracts/congestion';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string): string => `Bearer ${accessToken}`;

export async function listCongestionReports(
  accessToken: string,
): Promise<ListStaffCongestionResponse> {
  const { status, json } = await requestJson('GET', '/staff/congestion/reports', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return listStaffCongestionResponseSchema.parse(json);
}

export async function deleteCongestionReport(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/congestion/reports/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

export async function clearExpiredCongestionReports(accessToken: string): Promise<number> {
  const { status, json } = await requestJson('POST', '/staff/congestion/reports/clear-expired', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return clearExpiredCongestionResponseSchema.parse(json).removed;
}
