import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  MAX_NOTE,
  ukDay,
  validateDay,
  type CompanyId,
  type InvalidDay,
  type StaffId,
} from '../domain/maintenance.js';
import {
  repairTitle,
  sortRepairs,
  type DefectId,
  type Repair,
  type RepairId,
} from '../domain/repair.js';
import { canManage, canView, type Forbidden } from './item-types.js';
import type { StaffCaller } from './ports/directories.js';
import type { DefectDirectory, RepairRepository } from './ports/repairs.js';

/** An unknown id, or a defect or repair of a company the caller cannot see: the same answer, so ids cannot be probed. */
export type DefectNotFound = TaggedError<'DefectNotFound'>;
export type RepairNotFound = TaggedError<'RepairNotFound'>;
/** The defect is already fixed, so there is nothing to repair. */
export type DefectAlreadyFixed = TaggedError<'DefectAlreadyFixed'>;
/** The repair has already been finished or cancelled. */
export interface RepairNotOpen extends TaggedError<'RepairNotOpen'> {
  readonly status: Repair['status'];
}
export interface InvalidRepair extends TaggedError<'InvalidRepair'> {
  readonly reason: 'due_in_past' | 'done_in_future' | 'note_too_long';
}

export interface RepairDeps {
  readonly repairs: RepairRepository;
  readonly defects: DefectDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * Books a repair for a defect a driver found, due on `dueDate` (today or later). It marks the defect seen if it was still
 * open. Booking again for a defect that already has an open repair returns that repair and changes nothing, so a double
 * click or a retry makes no second job.
 */
export async function bookRepair(
  deps: RepairDeps,
  caller: StaffCaller,
  staffId: StaffId,
  input: { readonly defectId: string; readonly dueDate: string },
): Promise<
  Result<Repair, Forbidden | DefectNotFound | DefectAlreadyFixed | InvalidDay | InvalidRepair>
> {
  const defect = await deps.defects.find(input.defectId);
  if (defect === null || !(caller.kind === 'platform' || caller.companyId === defect.companyId)) {
    return err({ tag: 'DefectNotFound' });
  }
  if (!canManage(caller, defect.companyId)) return err({ tag: 'Forbidden' });
  if (defect.status === 'fixed') return err({ tag: 'DefectAlreadyFixed' });

  const due = validateDay(input.dueDate);
  if (!due.ok) return due;
  const now = deps.clock.now();
  if (due.value < ukDay(now)) return err({ tag: 'InvalidRepair', reason: 'due_in_past' });

  const existing = await deps.repairs.findOpenForDefect(defect.id);
  if (existing !== null) return ok(existing);

  const repair: Repair = {
    id: makeId<'RepairId'>(deps.ids.newId()),
    companyId: defect.companyId,
    defectId: defect.id,
    vehicleId: makeId<'FleetVehicleId'>(defect.vehicleId),
    vehicleName: defect.vehicleName,
    title: repairTitle(defect.label, defect.detail),
    severity: defect.severity,
    dueDate: due.value,
    status: 'open',
    note: undefined,
    doneOn: undefined,
    createdAt: now,
    createdBy: staffId,
    completedAt: undefined,
    completedBy: undefined,
  };
  await deps.repairs.insert(repair);
  if (defect.status === 'open') await deps.defects.setStatus(defect.id, 'acknowledged', staffId);
  return ok(repair);
}

/** The company's repairs: those still to do by default, soonest due first. */
export async function listRepairs(
  deps: Pick<RepairDeps, 'repairs'>,
  caller: StaffCaller,
  companyId: CompanyId,
  status: 'open' | 'done' | 'all' = 'open',
): Promise<Result<Repair[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(sortRepairs(await deps.repairs.list(companyId, status)));
}

async function ownRepair(
  deps: Pick<RepairDeps, 'repairs'>,
  caller: StaffCaller,
  id: RepairId,
): Promise<Result<Repair, Forbidden | RepairNotFound | RepairNotOpen>> {
  const repair = await deps.repairs.findById(id);
  if (repair === null || !(caller.kind === 'platform' || caller.companyId === repair.companyId)) {
    return err({ tag: 'RepairNotFound' });
  }
  if (!canManage(caller, repair.companyId)) return err({ tag: 'Forbidden' });
  if (repair.status !== 'open') return err({ tag: 'RepairNotOpen', status: repair.status });
  return ok(repair);
}

/**
 * Records that the repair was done, on `doneOn` (today if left out; never a day to come). With `markDefectFixed`, the
 * defect is marked fixed too, which releases a vehicle held back for it. Leave it off to finish the job but keep the
 * defect open, for when the repair did not cure it.
 */
export async function completeRepair(
  deps: RepairDeps,
  caller: StaffCaller,
  staffId: StaffId,
  id: RepairId,
  input: {
    readonly doneOn?: string | undefined;
    readonly note?: string | undefined;
    readonly markDefectFixed: boolean;
  },
): Promise<
  Result<Repair, Forbidden | RepairNotFound | RepairNotOpen | InvalidDay | InvalidRepair>
> {
  const found = await ownRepair(deps, caller, id);
  if (!found.ok) return found;
  const now = deps.clock.now();
  const today = ukDay(now);

  const doneOn = input.doneOn === undefined ? ok(today) : validateDay(input.doneOn);
  if (!doneOn.ok) return doneOn;
  if (doneOn.value > today) return err({ tag: 'InvalidRepair', reason: 'done_in_future' });
  const note = input.note?.trim();
  if (note !== undefined && note.length > MAX_NOTE) {
    return err({ tag: 'InvalidRepair', reason: 'note_too_long' });
  }

  await deps.repairs.complete(id, doneOn.value, note === '' ? undefined : note, staffId, now);
  if (input.markDefectFixed) {
    const defect = await deps.defects.find(found.value.defectId);
    if (defect !== null && defect.status !== 'fixed') {
      await deps.defects.setStatus(defect.id, 'fixed', staffId);
    }
  }
  const after = await deps.repairs.findById(id);
  return after === null ? err({ tag: 'RepairNotFound' }) : ok(after);
}

/** Cancels a repair booked in error. The defect is left as it is. */
export async function cancelRepair(
  deps: RepairDeps,
  caller: StaffCaller,
  staffId: StaffId,
  id: RepairId,
): Promise<Result<void, Forbidden | RepairNotFound | RepairNotOpen>> {
  const found = await ownRepair(deps, caller, id);
  if (!found.ok) return found;
  await deps.repairs.cancel(id, staffId, deps.clock.now());
  return ok(undefined);
}

export type { DefectId };
