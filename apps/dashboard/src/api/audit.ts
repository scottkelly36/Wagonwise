import { auditPackSchema, type AuditPackDto } from '@wagonwise/contracts/audit';

import { requestJson, throwUnlessSuccess } from './http';

/** One vehicle's audit pack for a range of UK days (`YYYY-MM-DD`). */
export async function getAuditPack(
  accessToken: string,
  vehicleId: string,
  range: { from: string; to: string },
): Promise<AuditPackDto> {
  const query = `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
  const { status, json } = await requestJson('GET', `/staff/audit/vehicles/${vehicleId}${query}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return auditPackSchema.parse(json);
}
