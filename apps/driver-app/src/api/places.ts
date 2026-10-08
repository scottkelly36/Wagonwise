import {
  listPlacesResponseSchema,
  savedPlaceSchema,
  type ListPlacesRequest,
  type MarkPlaceRequest,
  type NearbyPlacesRequest,
  type SavedPlaceDto,
  type UpdatePlaceRequest,
} from '@wagonwise/contracts/places';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

/** Marks a place: for the company when `companyId` is given, otherwise a personal one. */
export async function markPlace(
  accessToken: string,
  input: MarkPlaceRequest,
): Promise<SavedPlaceDto> {
  const { status, json } = await requestJson('POST', '/places', {
    body: input,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [201]);
  return savedPlaceSchema.parse(json);
}

/** The company's places, or (no `companyId`) the driver's own personal ones. */
export async function listPlaces(
  accessToken: string,
  input: ListPlacesRequest,
): Promise<SavedPlaceDto[]> {
  const { status, json } = await requestJson('POST', '/places/list', {
    body: input,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return listPlacesResponseSchema.parse(json).places;
}

export async function nearbyPlaces(
  accessToken: string,
  input: NearbyPlacesRequest,
): Promise<SavedPlaceDto[]> {
  const { status, json } = await requestJson('POST', '/places/nearby', {
    body: input,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return listPlacesResponseSchema.parse(json).places;
}

export async function updatePlace(
  accessToken: string,
  id: string,
  input: UpdatePlaceRequest,
): Promise<SavedPlaceDto> {
  const { status, json } = await requestJson('PUT', `/places/${id}`, {
    body: input,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return savedPlaceSchema.parse(json);
}

export async function deletePlace(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/places/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}
