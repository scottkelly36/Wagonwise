import {
  listPlacesResponseSchema,
  savedPlaceSchema,
  updatePlaceRequestSchema,
  type SavedPlaceDto,
  type UpdatePlaceRequest,
} from '@wagonwise/contracts/places';

import { requestJson, throwUnlessSuccess } from './http';

/** The company's saved places (marked by its drivers), for the Places page and the job form. */
export async function listPlaces(accessToken: string, companyId: string): Promise<SavedPlaceDto[]> {
  const { status, json } = await requestJson('GET', `/staff/places/companies/${companyId}/places`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listPlacesResponseSchema.parse(json).places;
}

/** Change a place's name, type or note (needs the dispatch privilege; core checks). */
export async function updatePlace(
  accessToken: string,
  id: string,
  input: UpdatePlaceRequest,
): Promise<SavedPlaceDto> {
  const body = updatePlaceRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/places/${id}`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return savedPlaceSchema.parse(json);
}

export async function deletePlace(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/places/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
