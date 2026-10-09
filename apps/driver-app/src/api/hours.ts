import {
  hoursSharingResponseSchema,
  reportHoursStatusRequestSchema,
  setHoursSharingRequestSchema,
  type HoursSharingRowDto,
  type ReportHoursStatusRequest,
} from '@wagonwise/contracts/hours';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

/** Each company the driver drives for: whether it has switched hours sharing on, and whether the driver shares. */
export async function getHoursSharing(accessToken: string): Promise<HoursSharingRowDto[]> {
  const { status, json } = await requestJson('GET', '/hours/sharing', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return hoursSharingResponseSchema.parse(json).companies;
}

/** The driver agrees to share with a company (recording the wording they were shown), or stops. */
export async function setHoursSharing(
  accessToken: string,
  companyId: string,
  sharing: boolean,
  wordingVersion: number,
): Promise<void> {
  const body = setHoursSharingRequestSchema.parse({ sharing, wordingVersion });
  const { status, json } = await requestJson(
    'PUT',
    `/hours/sharing/${encodeURIComponent(companyId)}`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
}

/** Sends the driver's latest status. Core refuses (409) unless they are on a job and both switches are on. */
export async function reportHoursStatus(
  accessToken: string,
  input: ReportHoursStatusRequest,
): Promise<void> {
  const body = reportHoursStatusRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', '/hours/status', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

/** The driver finished their shift: their status is removed. */
export async function clearHoursStatus(accessToken: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', '/hours/status', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}
