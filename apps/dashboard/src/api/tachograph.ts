import {
  tachographFileDownloadSchema,
  tachographFilesResponseSchema,
  tachographSettingsSchema,
  tachographStoredSchema,
  type TachographFileDownload,
  type TachographFilesResponse,
  type TachographSettingsDto,
  type UploadTachographFileRequest,
} from '@wagonwise/contracts/tachograph';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string) => `Bearer ${accessToken}`;
const base = (companyId: string) => `/staff/tachograph/companies/${companyId}`;

/** Whether drivers may send card files from the app, and how long files are kept. */
export async function getTachographSettings(
  accessToken: string,
  companyId: string,
): Promise<TachographSettingsDto> {
  const { status, json } = await requestJson('GET', `${base(companyId)}/settings`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return tachographSettingsSchema.parse(json);
}

export async function setTachographSettings(
  accessToken: string,
  companyId: string,
  settings: TachographSettingsDto,
): Promise<TachographSettingsDto> {
  const { status, json } = await requestJson('PUT', `${base(companyId)}/settings`, {
    body: tachographSettingsSchema.parse(settings),
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return tachographSettingsSchema.parse(json);
}

/** The newest file for each driver card and vehicle unit, and the newest files of all. */
export async function listTachographFiles(
  accessToken: string,
  companyId: string,
): Promise<TachographFilesResponse> {
  const { status, json } = await requestJson('GET', `${base(companyId)}/files`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return tachographFilesResponseSchema.parse(json);
}

/** Says whether the firm already held exactly this file (then nothing is changed). */
export async function uploadTachographFile(
  accessToken: string,
  companyId: string,
  request: UploadTachographFileRequest,
): Promise<{ duplicate: boolean }> {
  const { status, json } = await requestJson('POST', `${base(companyId)}/files`, {
    body: request,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200, 201]);
  return tachographStoredSchema.parse(json);
}

/** The file exactly as it was received. */
export async function getTachographFile(
  accessToken: string,
  companyId: string,
  fileId: string,
): Promise<TachographFileDownload> {
  const { status, json } = await requestJson('GET', `${base(companyId)}/files/${fileId}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return tachographFileDownloadSchema.parse(json);
}

export async function deleteTachographFile(
  accessToken: string,
  companyId: string,
  fileId: string,
): Promise<void> {
  const { status, json } = await requestJson('DELETE', `${base(companyId)}/files/${fileId}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}
