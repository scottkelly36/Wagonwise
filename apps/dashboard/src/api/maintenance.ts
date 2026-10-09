import {
  createItemTypeRequestSchema,
  itemTypeBodySchema,
  itemTypeSchema,
  listItemTypesResponseSchema,
  markDoneRequestSchema,
  overviewResponseSchema,
  scheduleSchema,
  setDueRequestSchema,
  starterItemsResponseSchema,
  vehicleMaintenanceResponseSchema,
  type CreateItemTypeRequest,
  type ItemTypeBody,
  type ItemTypeDto,
  type MarkDoneRequest,
  type OverviewRowDto,
  type ScheduleDto,
  type VehicleMaintenanceResponse,
} from '@wagonwise/contracts/maintenance';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string) => `Bearer ${accessToken}`;

/** What the company tracks (MOT, inspections, service...). */
export async function listItemTypes(
  accessToken: string,
  companyId: string,
): Promise<ItemTypeDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/maintenance/companies/${companyId}/items`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return listItemTypesResponseSchema.parse(json).items;
}

/** Example items to start from. */
export async function getStarterItems(accessToken: string): Promise<ItemTypeBody[]> {
  const { status, json } = await requestJson('GET', '/staff/maintenance/starter', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return starterItemsResponseSchema.parse(json).items;
}

export async function createItemType(
  accessToken: string,
  companyId: string,
  input: CreateItemTypeRequest,
): Promise<ItemTypeDto> {
  const body = createItemTypeRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/staff/maintenance/companies/${companyId}/items`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [201]);
  return itemTypeSchema.parse(json);
}

export async function updateItemType(
  accessToken: string,
  id: string,
  input: ItemTypeBody,
): Promise<ItemTypeDto> {
  const body = itemTypeBodySchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/maintenance/items/${id}`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return itemTypeSchema.parse(json);
}

/** Hides an item; what was recorded against it keeps its meaning. */
export async function archiveItemType(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/maintenance/items/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

/** Every vehicle with every item that applies to it, most urgent first. */
export async function getOverview(
  accessToken: string,
  companyId: string,
): Promise<OverviewRowDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/maintenance/companies/${companyId}/overview`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return overviewResponseSchema.parse(json).rows;
}

/** One vehicle's items, and what has been done to it. */
export async function getVehicleMaintenance(
  accessToken: string,
  vehicleId: string,
): Promise<VehicleMaintenanceResponse> {
  const { status, json } = await requestJson('GET', `/staff/maintenance/vehicles/${vehicleId}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return vehicleMaintenanceResponseSchema.parse(json);
}

export async function setDueDate(
  accessToken: string,
  vehicleId: string,
  itemId: string,
  dueDate: string,
): Promise<ScheduleDto> {
  const body = setDueRequestSchema.parse({ dueDate });
  const { status, json } = await requestJson(
    'PUT',
    `/staff/maintenance/vehicles/${vehicleId}/items/${itemId}/due`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return scheduleSchema.parse(json);
}

export async function markDone(
  accessToken: string,
  vehicleId: string,
  itemId: string,
  input: MarkDoneRequest,
): Promise<ScheduleDto> {
  const body = markDoneRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'POST',
    `/staff/maintenance/vehicles/${vehicleId}/items/${itemId}/done`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return scheduleSchema.parse(json);
}
