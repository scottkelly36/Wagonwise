import { usageReportSchema, type UsageReportDto } from '@wagonwise/contracts/usage';

import { requestJson, throwUnlessSuccess } from './http';

export async function getUsage(accessToken: string): Promise<UsageReportDto> {
  const { status, json } = await requestJson('GET', '/staff/usage', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return usageReportSchema.parse(json);
}
