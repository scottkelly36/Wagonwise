import {
  hoursSettingsSchema,
  listHoursStatusResponseSchema,
  type HoursStatusDto,
} from '@wagonwise/contracts/hours';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string) => `Bearer ${accessToken}`;

/** Whether the firm shows drivers' hours status on the live map (off until chosen). */
export async function getHoursSetting(accessToken: string, companyId: string): Promise<boolean> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/hours/companies/${companyId}/settings`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return hoursSettingsSchema.parse(json).enabled;
}

/** Turning it off removes every status held at once. */
export async function setHoursSetting(
  accessToken: string,
  companyId: string,
  enabled: boolean,
): Promise<boolean> {
  const body = hoursSettingsSchema.parse({ enabled });
  const { status, json } = await requestJson(
    'PUT',
    `/staff/hours/companies/${companyId}/settings`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return hoursSettingsSchema.parse(json).enabled;
}

/** The latest status of each driver who shares, on a job now. */
export async function listHoursStatuses(
  accessToken: string,
  companyId: string,
): Promise<HoursStatusDto[]> {
  const { status, json } = await requestJson('GET', `/staff/hours/companies/${companyId}/status`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return listHoursStatusResponseSchema.parse(json).statuses;
}
