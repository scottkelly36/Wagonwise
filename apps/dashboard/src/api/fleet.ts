import {
  createFleetVehicleRequestSchema,
  fleetVehicleSchema,
  listFleetVehiclesResponseSchema,
  updateFleetVehicleRequestSchema,
  type CreateFleetVehicleRequest,
  type FleetVehicleDto,
  type UpdateFleetVehicleRequest,
} from '@wagonwise/contracts/fleet';

import { requestJson, throwUnlessSuccess } from './http';

export async function listFleetVehicles(
  accessToken: string,
  companyId: string,
): Promise<FleetVehicleDto[]> {
  const { status, json } = await requestJson('GET', `/fleet/companies/${companyId}/vehicles`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listFleetVehiclesResponseSchema.parse(json).vehicles;
}

export async function createFleetVehicle(
  accessToken: string,
  companyId: string,
  input: CreateFleetVehicleRequest,
): Promise<FleetVehicleDto> {
  const body = createFleetVehicleRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/fleet/companies/${companyId}/vehicles`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return fleetVehicleSchema.parse(json);
}

export async function updateFleetVehicle(
  accessToken: string,
  id: string,
  input: UpdateFleetVehicleRequest,
): Promise<FleetVehicleDto> {
  const body = updateFleetVehicleRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/fleet/vehicles/${id}`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return fleetVehicleSchema.parse(json);
}

export async function deleteFleetVehicle(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/fleet/vehicles/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
