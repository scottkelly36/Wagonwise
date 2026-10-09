import { z } from 'zod';

/** The most rows one import takes; a longer statement is sent in more than one go (re-sending is harmless). */
export const FUEL_IMPORT_MAX_ROWS = 2000;

/** One purchase from a fuel card statement, as the dashboard reads it from the file's columns. */
export const fuelRowSchema = z.object({
  /** When the purchase was made, as an ISO time. */
  occurredAt: z.string().max(40),
  registration: z.string().max(40),
  litres: z.number().min(0).max(5000).optional(),
  /** Whole pence; negative for a credit. */
  amountPence: z.number().int(),
  description: z.string().max(200).optional(),
});
export type FuelRowDto = z.infer<typeof fuelRowSchema>;

/** `POST /staff/costing/companies/:companyId/fuel/import`. Each row stands alone; one that cannot be read is reported. */
export const importFuelRequestSchema = z.object({
  fileName: z.string().max(200),
  rows: z.array(fuelRowSchema).min(1).max(FUEL_IMPORT_MAX_ROWS),
});
export type ImportFuelRequest = z.infer<typeof importFuelRequestSchema>;

export const importFuelResponseSchema = z.object({
  importId: z.string().optional(),
  imported: z.number().int(),
  duplicates: z.number().int(),
  invalid: z.array(
    z.object({
      row: z.number().int(),
      reason: z.enum(['bad_date', 'bad_amount', 'bad_litres', 'no_registration']),
    }),
  ),
  matched: z.number().int(),
  unmatched: z.number().int(),
  unmatchedRegistrations: z.array(z.string()),
});
export type ImportFuelResponse = z.infer<typeof importFuelResponseSchema>;

export const costingCompanyParamsSchema = z.object({ companyId: z.string().min(1) });
export const fuelIdParamsSchema = z.object({ id: z.string().min(1) });

/** `GET /staff/costing/companies/:companyId/fuel?from=&to=`: purchases from `from` (inclusive) to `to` (exclusive). */
export const fuelQuerySchema = z.object({ from: z.iso.datetime(), to: z.iso.datetime() });

export const fuelTransactionSchema = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime(),
  registration: z.string(),
  vehicleId: z.string().optional(),
  vehicleName: z.string().optional(),
  litres: z.number().optional(),
  amountPence: z.number().int(),
  description: z.string().optional(),
});
export type FuelTransactionDto = z.infer<typeof fuelTransactionSchema>;

export const fuelSummaryLineSchema = z.object({
  vehicleId: z.string().optional(),
  vehicleName: z.string().optional(),
  registration: z.string().optional(),
  purchases: z.number().int(),
  litres: z.number(),
  amountPence: z.number().int(),
  /** Average over the purchases that gave litres. */
  pencePerLitre: z.number().int().optional(),
});
export type FuelSummaryLineDto = z.infer<typeof fuelSummaryLineSchema>;

export const fuelViewSchema = z.object({
  transactions: z.array(fuelTransactionSchema),
  byVehicle: z.array(fuelSummaryLineSchema),
  totalPence: z.number().int(),
  totalLitres: z.number(),
  unmatchedCount: z.number().int(),
});
export type FuelViewDto = z.infer<typeof fuelViewSchema>;

/** `GET /staff/costing/companies/:companyId/fuel/unmatched`: whatever its date, so none is forgotten. */
export const listUnmatchedResponseSchema = z.object({
  transactions: z.array(fuelTransactionSchema),
});

/** `POST /staff/costing/fuel/:id/vehicle`: match a purchase to a vehicle by hand; `null` takes it off one. */
export const assignFuelVehicleRequestSchema = z.object({ vehicleId: z.string().min(1).nullable() });
export type AssignFuelVehicleRequest = z.infer<typeof assignFuelVehicleRequestSchema>;

export const rematchFuelResponseSchema = z.object({ matched: z.number().int() });

export const fuelImportSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  importedAt: z.iso.datetime(),
  rowsTotal: z.number().int(),
  rowsImported: z.number().int(),
  rowsDuplicate: z.number().int(),
});
export type FuelImportDto = z.infer<typeof fuelImportSchema>;
export const listFuelImportsResponseSchema = z.object({ imports: z.array(fuelImportSchema) });

// ---------------------------------------------------------------------------------------------
// What a firm tells WagonWise about its own costs, so the cost of a job can be worked out.

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A cost carried every month from `fromMonth` until `toMonth` (for ever when absent): for one vehicle, or with no vehicle
 *  for the firm as a whole (an overhead). */
export const runningCostSchema = z.object({
  id: z.string(),
  vehicleId: z.string().optional(),
  description: z.string(),
  monthlyPence: z.number().int(),
  fromMonth: month,
  toMonth: month.optional(),
});
export type RunningCostDto = z.infer<typeof runningCostSchema>;
export const listRunningCostsResponseSchema = z.object({ costs: z.array(runningCostSchema) });

/** `POST /staff/costing/companies/:companyId/running-costs`. */
export const addRunningCostRequestSchema = z.object({
  vehicleId: z.string().min(1).nullable().optional(),
  description: z.string().min(1).max(80),
  monthlyPence: z.number().int().min(0).max(100_000_000),
  fromMonth: month,
});
export type AddRunningCostRequest = z.infer<typeof addRunningCostRequestSchema>;

/** `POST /staff/costing/running-costs/:id/change`: from a month on. Earlier months keep what they had. */
export const changeRunningCostRequestSchema = z.object({
  description: z.string().min(1).max(80),
  monthlyPence: z.number().int().min(0).max(100_000_000),
  fromMonth: month,
});
export type ChangeRunningCostRequest = z.infer<typeof changeRunningCostRequestSchema>;

/** `POST /staff/costing/running-costs/:id/stop`: it last applies the month before. */
export const stopRunningCostRequestSchema = z.object({ fromMonth: month });

export const driverRateSchema = z.object({
  id: z.string(),
  hourlyPence: z.number().int(),
  fromDay: day,
});
export const driverRatesSchema = z.object({
  driverId: z.string(),
  name: z.string(),
  /** Newest first. */
  rates: z.array(driverRateSchema),
});
export type DriverRatesDto = z.infer<typeof driverRatesSchema>;
export const listDriverRatesResponseSchema = z.object({ drivers: z.array(driverRatesSchema) });

/** `PUT /staff/costing/companies/:companyId/driver-rates`: what the driver costs an hour from a day on. */
export const setDriverRateRequestSchema = z.object({
  driverId: z.string().min(1),
  hourlyPence: z.number().int().min(1).max(50_000),
  fromDay: day,
});
export type SetDriverRateRequest = z.infer<typeof setDriverRateRequestSchema>;
