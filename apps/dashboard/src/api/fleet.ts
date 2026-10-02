import {
  companyCodeResponseSchema,
  createFleetVehicleRequestSchema,
  driverLinkSchema,
  fleetVehicleSchema,
  inviteDriverRequestSchema,
  listDriverLinksResponseSchema,
  listFleetVehiclesResponseSchema,
  updateFleetVehicleRequestSchema,
  type CreateFleetVehicleRequest,
  type DriverLinkDto,
  type FleetVehicleDto,
  type InviteDriverRequest,
  type UpdateFleetVehicleRequest,
} from '@wagonwise/contracts/fleet';

import { requestJson, throwUnlessSuccess } from './http';

export async function listFleetVehicles(
  accessToken: string,
  companyId: string,
): Promise<FleetVehicleDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/fleet/companies/${companyId}/vehicles`,
    {
      authorization: `Bearer ${accessToken}`,
    },
  );
  throwUnlessSuccess(status, json, [200]);
  return listFleetVehiclesResponseSchema.parse(json).vehicles;
}

export async function createFleetVehicle(
  accessToken: string,
  companyId: string,
  input: CreateFleetVehicleRequest,
): Promise<FleetVehicleDto> {
  const body = createFleetVehicleRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/staff/fleet/companies/${companyId}/vehicles`,
    {
      body,
      authorization: `Bearer ${accessToken}`,
    },
  );
  throwUnlessSuccess(status, json, [201]);
  return fleetVehicleSchema.parse(json);
}

export async function updateFleetVehicle(
  accessToken: string,
  id: string,
  input: UpdateFleetVehicleRequest,
): Promise<FleetVehicleDto> {
  const body = updateFleetVehicleRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/fleet/vehicles/${id}`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return fleetVehicleSchema.parse(json);
}

export async function deleteFleetVehicle(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/fleet/vehicles/${id}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}

// ---------------------------------------------------------------------------------------------
// Driver links and the company code (P2-M2.6): the Drivers page.
// ---------------------------------------------------------------------------------------------

export async function listDriverLinks(
  accessToken: string,
  companyId: string,
): Promise<DriverLinkDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/fleet/companies/${companyId}/driver-links`,
    { authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [200]);
  return listDriverLinksResponseSchema.parse(json).links;
}

export async function inviteDriver(
  accessToken: string,
  companyId: string,
  input: InviteDriverRequest,
): Promise<DriverLinkDto> {
  const body = inviteDriverRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/staff/fleet/companies/${companyId}/driver-links`,
    { body, authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [201]);
  return driverLinkSchema.parse(json);
}

async function settleDriverLink(
  accessToken: string,
  id: string,
  action: 'approve' | 'decline' | 'remove',
): Promise<DriverLinkDto> {
  const { status, json } = await requestJson('POST', `/staff/fleet/driver-links/${id}/${action}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return driverLinkSchema.parse(json);
}

export const approveDriverLink = (accessToken: string, id: string) =>
  settleDriverLink(accessToken, id, 'approve');
export const declineDriverLink = (accessToken: string, id: string) =>
  settleDriverLink(accessToken, id, 'decline');
export const removeDriverLink = (accessToken: string, id: string) =>
  settleDriverLink(accessToken, id, 'remove');

export async function getCompanyCode(accessToken: string, companyId: string): Promise<string> {
  const { status, json } = await requestJson('GET', `/staff/fleet/companies/${companyId}/code`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return companyCodeResponseSchema.parse(json).code;
}

export async function regenerateCompanyCode(
  accessToken: string,
  companyId: string,
): Promise<string> {
  const { status, json } = await requestJson(
    'POST',
    `/staff/fleet/companies/${companyId}/code/regenerate`,
    { authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [200]);
  return companyCodeResponseSchema.parse(json).code;
}
