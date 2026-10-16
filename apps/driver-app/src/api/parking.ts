import {
  findNearbySafeParkingSpotsResponseSchema,
  reportSafeParkingSpotRequestSchema,
  safeParkingSpotSchema,
  suggestParkingSpotEditRequestSchema,
  type FindNearbySafeParkingSpotsRequest,
  type ReportSafeParkingSpotRequest,
  type SafeParkingSpotDto,
  type SuggestParkingSpotEditRequest,
} from '@wagonwise/contracts/parking';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

export async function reportSafeParkingSpot(
  accessToken: string,
  input: ReportSafeParkingSpotRequest,
): Promise<SafeParkingSpotDto> {
  const body = reportSafeParkingSpotRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/parking/spots', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return safeParkingSpotSchema.parse(json);
}

/** Takes back a spot the driver just marked (the Undo after a one-tap voice report). */
export async function deleteSafeParkingSpot(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/parking/spots/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

/** Powers the map markers, same reasoning as congestion's/hazards' own `findNearby*` —
 *  `input.corridor` is one point for "near me" (home screen, Phase 1's only consumer for now). */
export async function findNearbySafeParkingSpots(
  accessToken: string,
  input: FindNearbySafeParkingSpotsRequest,
): Promise<SafeParkingSpotDto[]> {
  const { status, json } = await requestJson('POST', '/parking/spots/nearby', {
    body: input,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return findNearbySafeParkingSpotsResponseSchema.parse(json).spots;
}

/** Suggests a change to a spot, or says it is closed or gone. It waits for WagonWise staff to approve it. */
export async function suggestParkingSpotEdit(
  accessToken: string,
  spotId: string,
  input: SuggestParkingSpotEditRequest,
): Promise<void> {
  const body = suggestParkingSpotEditRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/parking/spots/${spotId}/suggestions`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}
