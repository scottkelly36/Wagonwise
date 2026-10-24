import {
  listPlacesResponseSchema,
  savedPlaceSchema,
  type ListPlacesRequest,
  type MarkPlaceRequest,
  type NearbyPlacesRequest,
  type NearbyPublicPlacesRequest,
  type PlaceReportReasonDto,
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

/** Shares one of the driver's personal places with a company they have joined. */
export async function sharePlace(
  accessToken: string,
  id: string,
  companyId: string,
): Promise<SavedPlaceDto> {
  const { status, json } = await requestJson('POST', `/places/${id}/share`, {
    body: { companyId },
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

/** Public places from every driver near a point: the farm gates and yards others have chosen to share. */
export async function nearbyPublicPlaces(
  accessToken: string,
  input: NearbyPublicPlacesRequest,
): Promise<SavedPlaceDto[]> {
  const { status, json } = await requestJson('POST', '/places/public/nearby', {
    body: input,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return listPlacesResponseSchema.parse(json).places;
}

/** The owner of a personal place makes it visible to every driver, or private again. */
export async function setPlaceVisibility(
  accessToken: string,
  id: string,
  isPublic: boolean,
): Promise<SavedPlaceDto> {
  const { status, json } = await requestJson('PUT', `/places/${id}/visibility`, {
    body: { isPublic },
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return savedPlaceSchema.parse(json);
}

/** Reports someone else's public place (wrong spot, offensive note, private land). */
export async function reportPlace(
  accessToken: string,
  id: string,
  reason: PlaceReportReasonDto,
): Promise<void> {
  const { status, json } = await requestJson('POST', `/places/${id}/report`, {
    body: { reason },
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}
