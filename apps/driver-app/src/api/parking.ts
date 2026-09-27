import {
  findNearbySafeParkingSpotsResponseSchema,
  reportSafeParkingSpotRequestSchema,
  safeParkingSpotSchema,
  type FindNearbySafeParkingSpotsRequest,
  type ReportSafeParkingSpotRequest,
  type SafeParkingSpotDto,
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
