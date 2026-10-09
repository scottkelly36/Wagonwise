import {
  bookRepairRequestSchema,
  completeRepairRequestSchema,
  createItemTypeRequestSchema,
  itemTypeBodySchema,
  maintenanceCompanyParamsSchema,
  maintenanceItemParamsSchema,
  maintenanceVehicleItemParamsSchema,
  maintenanceVehicleParamsSchema,
  markDoneRequestSchema,
  myRemindersSchema,
  repairParamsSchema,
  repairsQuerySchema,
  setDueRequestSchema,
} from '@wagonwise/contracts/maintenance';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  archiveItemType,
  createItemType,
  listItemTypes,
  starterItemTypes,
  updateItemType,
  type Forbidden,
  type ItemNotFound,
  type ItemTypeDeps,
  type VehicleNotInCompany,
} from '../application/item-types.js';
import type { CallerDirectory, StaffCaller } from '../application/ports/directories.js';
import {
  bookRepair,
  cancelRepair,
  completeRepair,
  listRepairs,
  type DefectAlreadyFixed,
  type DefectNotFound,
  type InvalidRepair,
  type RepairDeps,
  type RepairNotFound,
  type RepairNotOpen,
} from '../application/repairs.js';
import { ukDay } from '../domain/maintenance.js';
import { daysLeft, isOverdue, type Repair } from '../domain/repair.js';
import { getMyReminders, setMyReminders, type ReminderDeps } from '../application/reminders.js';
import {
  maintenanceOverview,
  markDone,
  setDueDate,
  vehicleMaintenance,
  type InvalidWork,
  type ItemNotForVehicle,
  type ScheduleDeps,
  type VehicleNotFound,
} from '../application/schedule.js';
import type {
  HistoryEntry,
  InvalidDay,
  InvalidItemType,
  ItemType,
  OverviewRow,
} from '../domain/maintenance.js';

export interface MaintenanceRouteDeps {
  readonly items: ItemTypeDeps;
  readonly schedule: ScheduleDeps;
  readonly repairs: RepairDeps;
  readonly reminders: Pick<ReminderDeps, 'preferences' | 'clock'>;
  readonly callerDirectory: CallerDirectory;
  /** Row-Level Security scope per request (migration 0050). */
  readonly dataScopes: DataScopes;
}

type MaintenanceError =
  | Forbidden
  | ItemNotFound
  | VehicleNotFound
  | VehicleNotInCompany
  | ItemNotForVehicle
  | InvalidItemType
  | InvalidDay
  | InvalidWork
  | DefectNotFound
  | DefectAlreadyFixed
  | RepairNotFound
  | RepairNotOpen
  | InvalidRepair;

function statusFor(error: MaintenanceError): number {
  switch (error.tag) {
    case 'Forbidden':
      return 403;
    case 'ItemNotFound':
    case 'DefectNotFound':
    case 'RepairNotFound':
    case 'VehicleNotFound':
      return 404;
    case 'DefectAlreadyFixed':
    case 'RepairNotOpen':
    case 'ItemNotForVehicle':
      return 409;
    case 'VehicleNotInCompany':
    case 'InvalidItemType':
    case 'InvalidDay':
    case 'InvalidWork':
    case 'InvalidRepair':
      return 400;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}
const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: MaintenanceError): Outcome => ({ status: statusFor(error), body: error });

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

const itemDto = (i: ItemType) => ({
  id: i.id,
  companyId: i.companyId,
  name: i.name,
  intervalValue: i.intervalValue,
  intervalUnit: i.intervalUnit,
  warnDays: i.warnDays,
  appliesTo: i.appliesTo,
  vehicleIds: i.vehicleIds,
});

const rowDto = (r: OverviewRow) => ({
  vehicleId: r.vehicleId,
  vehicleName: r.vehicleName,
  ...(r.registration === undefined ? {} : { registration: r.registration }),
  itemId: r.itemTypeId,
  itemName: r.itemName,
  ...(r.dueDate === undefined ? {} : { dueDate: r.dueDate }),
  ...(r.lastDone === undefined ? {} : { lastDone: r.lastDone }),
  status: r.status,
  ...(r.daysUntil === undefined ? {} : { daysUntil: r.daysUntil }),
});

const historyDto = (h: HistoryEntry) => ({
  id: h.id,
  itemId: h.itemTypeId,
  itemName: h.itemName,
  doneOn: h.doneOn,
  nextDue: h.nextDue,
  ...(h.note === undefined ? {} : { note: h.note }),
  recordedAt: h.recordedAt.toISOString(),
});

/**
 * Fleet maintenance for the dashboard: what a company tracks, when each item is next due on each vehicle, and marking
 * work done. Every use case checks the caller's own permission, and Row-Level Security (migration 0050) refuses
 * another company's rows.
 */
export function registerMaintenanceRoutes(app: FastifyInstance, deps: MaintenanceRouteDeps): void {
  async function asStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (caller: StaffCaller, staffId: string) => Promise<Outcome>,
  ) {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const staffId = request.staffId;
    const caller = await deps.callerDirectory.getCaller(makeId<'StaffId'>(staffId));
    const outcome =
      caller === null
        ? { status: 403, body: { tag: 'Forbidden' } }
        : await deps.dataScopes.run(scopeFor(caller), () => work(caller, staffId));
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  const repairDto = (r: Repair) => {
    const today = ukDay(deps.items.clock.now());
    return {
      id: r.id,
      defectId: r.defectId,
      vehicleId: r.vehicleId,
      vehicleName: r.vehicleName,
      title: r.title,
      severity: r.severity,
      dueDate: r.dueDate,
      status: r.status,
      daysLeft: daysLeft(r, today),
      overdue: isOverdue(r, today),
      ...(r.note === undefined ? {} : { note: r.note }),
      ...(r.doneOn === undefined ? {} : { doneOn: r.doneOn }),
    };
  };

  app.post('/staff/maintenance/repairs', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const body = bookRepairRequestSchema.safeParse(request.body);
      if (!body.success) return INVALID;
      const result = await bookRepair(deps.repairs, caller, makeId<'StaffId'>(staffId), body.data);
      return result.ok ? { status: 201, body: repairDto(result.value) } : failure(result.error);
    }),
  );

  app.get('/staff/maintenance/companies/:companyId/repairs', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = maintenanceCompanyParamsSchema.safeParse(request.params);
      const query = repairsQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return INVALID;
      const result = await listRepairs(
        deps.repairs,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
        query.data.status,
      );
      return result.ok
        ? { status: 200, body: { repairs: result.value.map(repairDto) } }
        : failure(result.error);
    }),
  );

  app.post('/staff/maintenance/repairs/:id/done', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = repairParamsSchema.safeParse(request.params);
      const body = completeRepairRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await completeRepair(
        deps.repairs,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'RepairId'>(params.data.id),
        body.data,
      );
      return result.ok ? { status: 200, body: repairDto(result.value) } : failure(result.error);
    }),
  );

  app.delete('/staff/maintenance/repairs/:id', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = repairParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await cancelRepair(
        deps.repairs,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'RepairId'>(params.data.id),
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  app.get('/staff/maintenance/my-reminders', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const result = await getMyReminders(deps.reminders, caller, makeId<'StaffId'>(staffId));
      return result.ok ? { status: 200, body: { channel: result.value } } : failure(result.error);
    }),
  );

  app.put('/staff/maintenance/my-reminders', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const body = myRemindersSchema.safeParse(request.body);
      if (!body.success) return INVALID;
      const result = await setMyReminders(
        deps.reminders,
        caller,
        makeId<'StaffId'>(staffId),
        body.data.channel,
      );
      return result.ok ? { status: 200, body: { channel: result.value } } : failure(result.error);
    }),
  );

  app.get('/staff/maintenance/starter', (request, reply) =>
    asStaff(request, reply, () =>
      Promise.resolve({ status: 200, body: { items: starterItemTypes() } }),
    ),
  );

  app.get('/staff/maintenance/companies/:companyId/items', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = maintenanceCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listItemTypes(
        deps.items,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? { status: 200, body: { items: result.value.map(itemDto) } }
        : failure(result.error);
    }),
  );

  app.post('/staff/maintenance/companies/:companyId/items', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = maintenanceCompanyParamsSchema.safeParse(request.params);
      const body = createItemTypeRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await createItemType(deps.items, caller, {
        ...body.data,
        id: makeId<'MaintenanceItemId'>(body.data.id),
        companyId: makeId<'CompanyId'>(params.data.companyId),
        vehicleIds: body.data.vehicleIds.map((v) => makeId<'FleetVehicleId'>(v)),
      });
      return result.ok ? { status: 201, body: itemDto(result.value) } : failure(result.error);
    }),
  );

  app.put('/staff/maintenance/items/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = maintenanceItemParamsSchema.safeParse(request.params);
      const body = itemTypeBodySchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await updateItemType(
        deps.items,
        caller,
        makeId<'MaintenanceItemId'>(params.data.id),
        { ...body.data, vehicleIds: body.data.vehicleIds.map((v) => makeId<'FleetVehicleId'>(v)) },
      );
      return result.ok ? { status: 200, body: itemDto(result.value) } : failure(result.error);
    }),
  );

  app.delete('/staff/maintenance/items/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = maintenanceItemParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await archiveItemType(
        deps.items,
        caller,
        makeId<'MaintenanceItemId'>(params.data.id),
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  app.get('/staff/maintenance/companies/:companyId/overview', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = maintenanceCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await maintenanceOverview(
        deps.schedule,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? { status: 200, body: { rows: result.value.map(rowDto) } }
        : failure(result.error);
    }),
  );

  app.get('/staff/maintenance/vehicles/:vehicleId', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = maintenanceVehicleParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await vehicleMaintenance(
        deps.schedule,
        caller,
        makeId<'FleetVehicleId'>(params.data.vehicleId),
      );
      return result.ok
        ? {
            status: 200,
            body: {
              rows: result.value.rows.map(rowDto),
              history: result.value.history.map(historyDto),
            },
          }
        : failure(result.error);
    }),
  );

  app.put('/staff/maintenance/vehicles/:vehicleId/items/:itemId/due', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = maintenanceVehicleItemParamsSchema.safeParse(request.params);
      const body = setDueRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await setDueDate(
        deps.schedule,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'FleetVehicleId'>(params.data.vehicleId),
        makeId<'MaintenanceItemId'>(params.data.itemId),
        body.data.dueDate,
      );
      return result.ok
        ? {
            status: 200,
            body: {
              dueDate: result.value.dueDate,
              ...(result.value.lastDone === undefined ? {} : { lastDone: result.value.lastDone }),
            },
          }
        : failure(result.error);
    }),
  );

  app.post('/staff/maintenance/vehicles/:vehicleId/items/:itemId/done', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = maintenanceVehicleItemParamsSchema.safeParse(request.params);
      const body = markDoneRequestSchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) return INVALID;
      const result = await markDone(
        deps.schedule,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'FleetVehicleId'>(params.data.vehicleId),
        makeId<'MaintenanceItemId'>(params.data.itemId),
        body.data,
      );
      return result.ok
        ? {
            status: 200,
            body: {
              dueDate: result.value.dueDate,
              ...(result.value.lastDone === undefined ? {} : { lastDone: result.value.lastDone }),
            },
          }
        : failure(result.error);
    }),
  );
}
