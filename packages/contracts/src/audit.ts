import { z } from 'zod';

export const auditVehicleParamsSchema = z.object({ vehicleId: z.uuid() });

/** `GET /staff/audit/vehicles/:vehicleId?from=&to=`: UK days, both optional (the last twelve months if left out). */
export const auditPackQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type AuditPackQuery = z.infer<typeof auditPackQuerySchema>;

export const AUDIT_CHECK_RESULTS = ['clear', 'advisory', 'do_not_drive'] as const;
export const AUDIT_DEFECT_STATUSES = ['open', 'acknowledged', 'fixed'] as const;
export const AUDIT_REPAIR_STATUSES = ['open', 'done', 'cancelled'] as const;
export const AUDIT_ITEM_STATES = ['overdue', 'due_soon', 'ok'] as const;
export const AUDIT_EVENT_KINDS = [
  'check',
  'defect_found',
  'defect_changed',
  'repair_booked',
  'repair_finished',
  'maintenance_done',
  'due_date_changed',
] as const;

/** One walk-round check, as the driver filed it. `who` is a name or sign-in the office already sees. */
export const auditCheckSchema = z.object({
  id: z.string(),
  submittedAt: z.iso.datetime(),
  day: z.iso.date(),
  list: z.string(),
  listVersion: z.number().int(),
  who: z.string(),
  result: z.enum(AUDIT_CHECK_RESULTS),
  defects: z.number().int(),
});

export const auditRepairSchema = z.object({
  title: z.string(),
  dueDate: z.iso.date(),
  status: z.enum(AUDIT_REPAIR_STATUSES),
  doneOn: z.iso.date().optional(),
  note: z.string().optional(),
  bookedBy: z.string().optional(),
  finishedBy: z.string().optional(),
});

/** One change of a defect's status and who made it. */
export const auditDefectStepSchema = z.object({
  status: z.enum(AUDIT_DEFECT_STATUSES),
  at: z.iso.datetime(),
  by: z.string().optional(),
});

export const auditDefectSchema = z.object({
  id: z.string(),
  foundAt: z.iso.datetime(),
  foundBy: z.string(),
  item: z.string(),
  severity: z.enum(['advisory', 'do_not_drive']),
  detail: z.string(),
  note: z.string().optional(),
  status: z.enum(AUDIT_DEFECT_STATUSES),
  /** The most recent change of status, and who made it. */
  lastChangeAt: z.iso.datetime().optional(),
  lastChangeBy: z.string().optional(),
  /** Every change of status, oldest first. */
  history: z.array(auditDefectStepSchema),
  repair: auditRepairSchema.optional(),
});

export const auditItemSchema = z.object({
  name: z.string(),
  dueDate: z.iso.date(),
  lastDone: z.iso.date().optional(),
  state: z.enum(AUDIT_ITEM_STATES),
});

export const auditDoneSchema = z.object({
  item: z.string(),
  doneOn: z.iso.date(),
  nextDue: z.iso.date(),
  note: z.string().optional(),
  by: z.string().optional(),
  recordedAt: z.iso.datetime(),
});

/** A due date entered or corrected by hand. `from` is absent the first time a date was entered. */
export const auditDateChangeSchema = z.object({
  item: z.string(),
  from: z.iso.date().optional(),
  to: z.iso.date(),
  at: z.iso.datetime(),
  by: z.string().optional(),
});

export const auditEventSchema = z.object({
  at: z.iso.datetime(),
  kind: z.enum(AUDIT_EVENT_KINDS),
  title: z.string(),
  detail: z.string().optional(),
  who: z.string().optional(),
});

export const auditPackSchema = z.object({
  vehicle: z.object({
    id: z.string(),
    name: z.string(),
    registration: z.string().optional(),
    /** The company the vehicle belongs to, for the heading of a printed copy. */
    company: z.string().optional(),
  }),
  range: z.object({ from: z.iso.date(), to: z.iso.date() }),
  generatedAt: z.iso.datetime(),
  summary: z.object({
    checks: z.number().int(),
    clear: z.number().int(),
    advisory: z.number().int(),
    doNotDrive: z.number().int(),
    defectsFound: z.number().int(),
    defectsNotFixed: z.number().int(),
    maintenanceDone: z.number().int(),
    maintenanceOverdue: z.number().int(),
    dueDatesChanged: z.number().int(),
  }),
  checks: z.array(auditCheckSchema),
  defects: z.array(auditDefectSchema),
  maintenance: z.object({
    items: z.array(auditItemSchema),
    done: z.array(auditDoneSchema),
    /** Every time a due date was entered or corrected by hand in the period, oldest first. */
    changes: z.array(auditDateChangeSchema),
  }),
  /** Everything above in one list, oldest first. */
  timeline: z.array(auditEventSchema),
});
export type AuditPackDto = z.infer<typeof auditPackSchema>;
export type AuditEventDto = z.infer<typeof auditEventSchema>;
