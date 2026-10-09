import {
  assignFuelVehicleRequestSchema,
  fuelViewSchema,
  importFuelRequestSchema,
  importFuelResponseSchema,
  listFuelImportsResponseSchema,
  listUnmatchedResponseSchema,
  rematchFuelResponseSchema,
  type FuelImportDto,
  type FuelRowDto,
  type FuelTransactionDto,
  type FuelViewDto,
  type ImportFuelResponse,
} from '@wagonwise/contracts/costing';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string) => `Bearer ${accessToken}`;

/** Sends a statement's purchases. Each is matched to a vehicle by registration; ones already held are skipped. */
export async function importFuel(
  accessToken: string,
  companyId: string,
  fileName: string,
  rows: FuelRowDto[],
): Promise<ImportFuelResponse> {
  const body = importFuelRequestSchema.parse({ fileName, rows });
  const { status, json } = await requestJson(
    'POST',
    `/staff/costing/companies/${companyId}/fuel/import`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return importFuelResponseSchema.parse(json);
}

/** Purchases from `from` (inclusive) to `to` (exclusive), with the totals by vehicle. */
export async function getFuel(
  accessToken: string,
  companyId: string,
  range: { from: Date; to: Date },
): Promise<FuelViewDto> {
  const query = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`;
  const { status, json } = await requestJson(
    'GET',
    `/staff/costing/companies/${companyId}/fuel?${query}`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return fuelViewSchema.parse(json);
}

/** Purchases not matched to a vehicle, whatever their date. */
export async function listUnmatchedFuel(
  accessToken: string,
  companyId: string,
): Promise<FuelTransactionDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/costing/companies/${companyId}/fuel/unmatched`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return listUnmatchedResponseSchema.parse(json).transactions;
}

/** Matches every unmatched purchase whose registration now belongs to exactly one vehicle. */
export async function rematchFuel(accessToken: string, companyId: string): Promise<number> {
  const { status, json } = await requestJson(
    'POST',
    `/staff/costing/companies/${companyId}/fuel/rematch`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return rematchFuelResponseSchema.parse(json).matched;
}

/** Matches one purchase to a vehicle by hand; `null` takes it off one. */
export async function assignFuelVehicle(
  accessToken: string,
  id: string,
  vehicleId: string | null,
): Promise<void> {
  const body = assignFuelVehicleRequestSchema.parse({ vehicleId });
  const { status, json } = await requestJson('POST', `/staff/costing/fuel/${id}/vehicle`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

export async function listFuelImports(
  accessToken: string,
  companyId: string,
): Promise<FuelImportDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/costing/companies/${companyId}/fuel/imports`,
    { authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [200]);
  return listFuelImportsResponseSchema.parse(json).imports;
}

/** Takes back a whole import: every purchase it brought goes. */
export async function undoFuelImport(accessToken: string, id: string): Promise<void> {
  const { status, json } = await requestJson('DELETE', `/staff/costing/fuel/imports/${id}`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}
