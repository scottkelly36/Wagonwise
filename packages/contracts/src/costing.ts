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
