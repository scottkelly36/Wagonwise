import {
  listParkingSpotsResponseSchema,
  listSpotSuggestionsResponseSchema,
  safeParkingSpotSchema,
  type ListParkingSpotsResponse,
  type ListSpotSuggestionsResponse,
  type ParkingKind,
  type ParkingSource,
  type SafeParkingSpotDto,
  type SaveParkingSpotRequest,
} from '@wagonwise/contracts/parking';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string): string => `Bearer ${accessToken}`;

export async function listParkingSpots(
  accessToken: string,
  filter: { q?: string; source?: ParkingSource; kind?: ParkingKind },
): Promise<ListParkingSpotsResponse> {
  const params = new URLSearchParams();
  if (filter.q !== undefined && filter.q.trim() !== '') params.set('q', filter.q.trim());
  if (filter.source !== undefined) params.set('source', filter.source);
  if (filter.kind !== undefined) params.set('kind', filter.kind);
  const query = params.toString();
  const { status, json } = await requestJson(
    'GET',
    `/staff/parking/spots${query === '' ? '' : `?${query}`}`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return listParkingSpotsResponseSchema.parse(json);
}

export async function addParkingSpot(
  accessToken: string,
  request: SaveParkingSpotRequest,
): Promise<SafeParkingSpotDto> {
  const { status, json } = await requestJson('POST', '/staff/parking/spots', {
    authorization: bearer(accessToken),
    body: request,
  });
  throwUnlessSuccess(status, json, [201]);
  return safeParkingSpotSchema.parse(json);
}

export async function updateParkingSpot(
  accessToken: string,
  id: string,
  request: SaveParkingSpotRequest,
): Promise<SafeParkingSpotDto> {
  const { status, json } = await requestJson('PUT', `/staff/parking/spots/${id}`, {
    authorization: bearer(accessToken),
    body: request,
  });
  throwUnlessSuccess(status, json, [200]);
  return safeParkingSpotSchema.parse(json);
}

export async function deleteParkingSpot(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/parking/spots/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

export async function listSpotSuggestions(
  accessToken: string,
): Promise<ListSpotSuggestionsResponse> {
  const { status, json } = await requestJson('GET', '/staff/parking/suggestions', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return listSpotSuggestionsResponseSchema.parse(json);
}

export async function decideSpotSuggestion(
  accessToken: string,
  id: string,
  decision: 'approve' | 'reject',
): Promise<void> {
  const { status, json } = await requestJson(
    'POST',
    `/staff/parking/suggestions/${id}/${decision}`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [204]);
}
