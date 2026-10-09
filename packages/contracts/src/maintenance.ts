import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';

/**
 * Fleet maintenance: each company keeps its own list of things that fall due on its vehicles (MOT, safety inspections,
 * service, tachograph calibration...) and when each is next due on each vehicle.
 */
export const maintenanceItemIdSchema = brandedId<'MaintenanceItemId'>();
export type MaintenanceItemId = z.infer<typeof maintenanceItemIdSchema>;

export const ITEM_NAME_MAX = 80;
export const NOTE_MAX = 500;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const intervalUnitSchema = z.enum(['days', 'weeks', 'months']);
export type IntervalUnitDto = z.infer<typeof intervalUnitSchema>;

export const itemTypeBodySchema = z.object({
  name: z.string().trim().min(1).max(ITEM_NAME_MAX),
  intervalValue: z.number().int().min(1).max(1200),
  intervalUnit: intervalUnitSchema,
  /** From this many days before it is due, it shows as due soon. */
  warnDays: z.number().int().min(0).max(365),
  appliesTo: z.enum(['all', 'selected']),
  vehicleIds: z.array(z.string().min(1)).max(500),
});
export type ItemTypeBody = z.infer<typeof itemTypeBodySchema>;

export const itemTypeSchema = itemTypeBodySchema.extend({
  id: maintenanceItemIdSchema,
  companyId: companyIdSchema,
});
export type ItemTypeDto = z.infer<typeof itemTypeSchema>;

/** `POST /staff/maintenance/companies/:companyId/items`. `id` is chosen by the portal so a retry makes no second item. */
export const createItemTypeRequestSchema = itemTypeBodySchema.extend({
  id: maintenanceItemIdSchema,
});
export type CreateItemTypeRequest = z.infer<typeof createItemTypeRequestSchema>;

export const listItemTypesResponseSchema = z.object({ items: z.array(itemTypeSchema) });

/** `GET /staff/maintenance/starter`: example items to start from. */
export const starterItemsResponseSchema = z.object({ items: z.array(itemTypeBodySchema) });

export const maintenanceCompanyParamsSchema = z.object({ companyId: z.string().min(1) });
export const maintenanceItemParamsSchema = z.object({ id: z.string().min(1) });
export const maintenanceVehicleParamsSchema = z.object({ vehicleId: z.string().min(1) });
export const maintenanceVehicleItemParamsSchema = z.object({
  vehicleId: z.string().min(1),
  itemId: z.string().min(1),
});

export const maintenanceStatusSchema = z.enum(['overdue', 'due_soon', 'ok', 'no_date']);
export type MaintenanceStatusDto = z.infer<typeof maintenanceStatusSchema>;

export const overviewRowSchema = z.object({
  vehicleId: z.string(),
  vehicleName: z.string(),
  registration: z.string().optional(),
  itemId: maintenanceItemIdSchema,
  itemName: z.string(),
  dueDate: day.optional(),
  lastDone: day.optional(),
  status: maintenanceStatusSchema,
  /** Days until due; negative once overdue; absent when no date has been entered. */
  daysUntil: z.number().int().optional(),
});
export type OverviewRowDto = z.infer<typeof overviewRowSchema>;

/** `GET /staff/maintenance/companies/:companyId/overview`: most urgent first. */
export const overviewResponseSchema = z.object({ rows: z.array(overviewRowSchema) });

export const historyEntrySchema = z.object({
  id: z.string(),
  itemId: maintenanceItemIdSchema,
  itemName: z.string(),
  doneOn: day,
  nextDue: day,
  note: z.string().optional(),
  recordedAt: z.iso.datetime(),
});
export type HistoryEntryDto = z.infer<typeof historyEntrySchema>;

/** `GET /staff/maintenance/vehicles/:vehicleId`: one vehicle's items, and what has been done to it, newest first. */
export const vehicleMaintenanceResponseSchema = z.object({
  rows: z.array(overviewRowSchema),
  history: z.array(historyEntrySchema),
});
export type VehicleMaintenanceResponse = z.infer<typeof vehicleMaintenanceResponseSchema>;

/** `PUT /staff/maintenance/vehicles/:vehicleId/items/:itemId/due`: when it is next due. */
export const setDueRequestSchema = z.object({ dueDate: day });
export type SetDueRequest = z.infer<typeof setDueRequestSchema>;

/** `POST /staff/maintenance/vehicles/:vehicleId/items/:itemId/done`: the work was done. Every field may be left out. */
export const markDoneRequestSchema = z.object({
  /** Today when left out; never a day to come. */
  doneOn: day.optional(),
  /** The item's interval after `doneOn` when left out. */
  nextDue: day.optional(),
  note: z.string().max(NOTE_MAX).optional(),
});
export type MarkDoneRequest = z.infer<typeof markDoneRequestSchema>;

export const scheduleSchema = z.object({ dueDate: day, lastDone: day.optional() });
export type ScheduleDto = z.infer<typeof scheduleSchema>;

/** How a person who books vehicles in is told what is due: an email each morning, or only by looking at the portal. */
export const reminderChannelSchema = z.enum(['email', 'none']);
export type ReminderChannel = z.infer<typeof reminderChannelSchema>;

/** `GET` and `PUT /staff/maintenance/my-reminders`: the signed-in person's own choice (email until they choose). */
export const myRemindersSchema = z.object({ channel: reminderChannelSchema });
export type MyRemindersDto = z.infer<typeof myRemindersSchema>;

// ---------------------------------------------------------------------------------------------
// Repairs: a defect a driver found, booked for fixing.

export const repairIdSchema = brandedId<'RepairId'>();
export type RepairId = z.infer<typeof repairIdSchema>;

export const repairStatusSchema = z.enum(['open', 'done', 'cancelled']);

export const repairSchema = z.object({
  id: repairIdSchema,
  defectId: z.string(),
  vehicleId: z.string(),
  vehicleName: z.string(),
  /** What is to be repaired, in words. */
  title: z.string(),
  severity: z.enum(['advisory', 'do_not_drive']),
  dueDate: day,
  status: repairStatusSchema,
  /** Days until due; negative once late. */
  daysLeft: z.number().int(),
  overdue: z.boolean(),
  note: z.string().optional(),
  doneOn: day.optional(),
});
export type RepairDto = z.infer<typeof repairSchema>;

/** `POST /staff/maintenance/repairs`: book a repair for a defect, due on `dueDate` (today or later). */
export const bookRepairRequestSchema = z.object({ defectId: z.string().min(1), dueDate: day });
export type BookRepairRequest = z.infer<typeof bookRepairRequestSchema>;

/** `GET /staff/maintenance/companies/:companyId/repairs?status=` (still to do when left out). */
export const repairsQuerySchema = z.object({ status: z.enum(['open', 'done', 'all']).optional() });
export const listRepairsResponseSchema = z.object({ repairs: z.array(repairSchema) });

export const repairParamsSchema = z.object({ id: z.string().min(1) });

/** `POST /staff/maintenance/repairs/:id/done`. With `markDefectFixed`, the defect is marked fixed too. */
export const completeRepairRequestSchema = z.object({
  /** Today when left out; never a day to come. */
  doneOn: day.optional(),
  note: z.string().max(NOTE_MAX).optional(),
  markDefectFixed: z.boolean(),
});
export type CompleteRepairRequest = z.infer<typeof completeRepairRequestSchema>;
