import { listTestersResponseSchema, type ListTestersResponse } from '@wagonwise/contracts/signups';

import { requestJson, throwUnlessSuccess } from './http';

export async function listTesters(accessToken: string): Promise<ListTestersResponse> {
  const { status, json } = await requestJson('GET', '/staff/signups', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listTestersResponseSchema.parse(json);
}

export async function deleteTester(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/signups/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
