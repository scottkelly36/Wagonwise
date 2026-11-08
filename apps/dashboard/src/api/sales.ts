import {
  addEntryResponseSchema,
  importResponseSchema,
  prospectSchema,
  salesResponseSchema,
  type AddEntryRequest,
  type AddEntryResponse,
  type CreateProspectRequest,
  type ImportResponse,
  type ImportRow,
  type ProspectDto,
  type SalesResponse,
  type UpdateProspectRequest,
} from '@wagonwise/contracts/sales';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

export async function getSales(accessToken: string): Promise<SalesResponse> {
  const { status, json } = await requestJson('GET', '/staff/sales', bearer(accessToken));
  throwUnlessSuccess(status, json, [200]);
  return salesResponseSchema.parse(json);
}

export async function createProspect(
  accessToken: string,
  request: CreateProspectRequest,
): Promise<ProspectDto> {
  const { status, json } = await requestJson('POST', '/staff/sales/prospects', {
    ...bearer(accessToken),
    body: request,
  });
  throwUnlessSuccess(status, json, [201]);
  return prospectSchema.parse(json);
}

export async function updateProspect(
  accessToken: string,
  id: string,
  request: UpdateProspectRequest,
): Promise<ProspectDto> {
  const { status, json } = await requestJson('PUT', `/staff/sales/prospects/${id}`, {
    ...bearer(accessToken),
    body: request,
  });
  throwUnlessSuccess(status, json, [200]);
  return prospectSchema.parse(json);
}

export async function deleteProspect(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson(
    'DELETE',
    `/staff/sales/prospects/${id}`,
    bearer(accessToken),
  );
  throwUnlessSuccess(status, json, [204]);
}

export async function addEntry(
  accessToken: string,
  prospectId: string,
  request: AddEntryRequest,
): Promise<AddEntryResponse> {
  const { status, json } = await requestJson(
    'POST',
    `/staff/sales/prospects/${prospectId}/entries`,
    {
      ...bearer(accessToken),
      body: request,
    },
  );
  throwUnlessSuccess(status, json, [201]);
  return addEntryResponseSchema.parse(json);
}

export async function deleteEntry(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson(
    'DELETE',
    `/staff/sales/entries/${id}`,
    bearer(accessToken),
  );
  throwUnlessSuccess(status, json, [204]);
}

export async function importProspects(
  accessToken: string,
  rows: ImportRow[],
): Promise<ImportResponse> {
  const { status, json } = await requestJson('POST', '/staff/sales/import', {
    ...bearer(accessToken),
    body: { rows },
  });
  throwUnlessSuccess(status, json, [200]);
  return importResponseSchema.parse(json);
}
