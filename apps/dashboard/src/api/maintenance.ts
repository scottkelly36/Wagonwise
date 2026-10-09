import {
  bookRepairRequestSchema,
  completeRepairRequestSchema,
  createItemTypeRequestSchema,
  importDatesRequestSchema,
  importDatesResponseSchema,
  itemTypeBodySchema,
  itemTypeSchema,
  listRepairsResponseSchema,
  listItemTypesResponseSchema,
  markDoneRequestSchema,
  myRemindersSchema,
  overviewResponseSchema,
  repairSchema,
  scheduleSchema,
  setDueRequestSchema,
  starterItemsResponseSchema,
  vehicleMaintenanceResponseSchema,
  type CompleteRepairRequest,
  type ImportRowResultDto,
  type CreateItemTypeRequest,
  type ItemTypeBody,
  type ItemTypeDto,
  type MarkDoneRequest,
  type OverviewRowDto,
  type RepairDto,
  type ReminderChannel,
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

/** How the signed-in person is reminded: an email each morning (until they choose otherwise), or only in the portal. */
export async function getMyReminders(accessToken: string): Promise<ReminderChannel> {
  const { status, json } = await requestJson('GET', '/staff/maintenance/my-reminders', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return myRemindersSchema.parse(json).channel;
}

export async function setMyReminders(
  accessToken: string,
  channel: ReminderChannel,
): Promise<ReminderChannel> {
  const body = myRemindersSchema.parse({ channel });
  const { status, json } = await requestJson('PUT', '/staff/maintenance/my-reminders', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return myRemindersSchema.parse(json).channel;
}

/** Books a repair for a defect a driver found, due on `dueDate`. Booking again returns the one already booked. */
export async function bookRepair(
  accessToken: string,
  defectId: string,
  dueDate: string,
): Promise<RepairDto> {
  const body = bookRepairRequestSchema.parse({ defectId, dueDate });
  const { status, json } = await requestJson('POST', '/staff/maintenance/repairs', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200, 201]);
  return repairSchema.parse(json);
}

/** The company's repairs: those still to do unless asked otherwise. */
export async function listRepairs(
  accessToken: string,
  companyId: string,
  filter: 'open' | 'done' | 'all' = 'open',
): Promise<RepairDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/maintenance/companies/${companyId}/repairs?status=${filter}`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return listRepairsResponseSchema.parse(json).repairs;
}

export async function completeRepair(
  accessToken: string,
  id: string,
  input: CompleteRepairRequest,
): Promise<RepairDto> {
  const body = completeRepairRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/staff/maintenance/repairs/${id}/done`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return repairSchema.parse(json);
}

export async function cancelRepair(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/maintenance/repairs/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

/** Sets next-due dates in bulk. Each row stands alone: the result says, row for row, what went in and what did not. */
export async function importDates(
  accessToken: string,
  companyId: string,
  rows: { registration: string; itemName: string; dueDate: string }[],
): Promise<ImportRowResultDto[]> {
  const body = importDatesRequestSchema.parse({ rows });
  const { status, json } = await requestJson(
    'POST',
    `/staff/maintenance/companies/${companyId}/import`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return importDatesResponseSchema.parse(json).results;
}
