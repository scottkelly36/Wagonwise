import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId, StaffId, VehicleId } from '../domain/fuel.js';
import {
  planChange,
  planStop,
  validateRate,
  validateRunningCost,
  type DriverId,
  type DriverRate,
  type DriverRateId,
  type InvalidCostChange,
  type InvalidRate,
  type InvalidRunningCost,
  type RunningCost,
  type RunningCostId,
} from '../domain/inputs.js';
import type {
  DriverDirectory,
  DriverRateRepository,
  RunningCostRepository,
} from './inputs-ports.js';
import type { StaffCaller, VehicleDirectory } from './ports.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type NotFound = TaggedError<'NotFound'>;
export type VehicleNotFound = TaggedError<'VehicleNotFound'>;
export type DriverNotFound = TaggedError<'DriverNotFound'>;

export interface InputsDeps {
  readonly runningCosts: RunningCostRepository;
  readonly rates: DriverRateRepository;
  readonly drivers: DriverDirectory;
  readonly vehicles: VehicleDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/**
 * Running costs and what drivers are paid are the firm's money, and wages are private, so they need `manage_billing` (the
 * firm's money person), or WagonWise. Nobody else reads them, whatever else they can see.
 */
export const canManageCosts = (caller: StaffCaller, companyId: CompanyId): boolean =>
  caller.kind === 'platform' ||
  (caller.companyId === companyId && caller.privileges.includes('manage_billing'));

const sees = (caller: StaffCaller, companyId: CompanyId): boolean =>
  caller.kind === 'platform' || caller.companyId === companyId;

const forbidden = (): { ok: false; error: Forbidden } => ({
  ok: false,
  error: { tag: 'Forbidden' },
});

// --- running costs ------------------------------------------------------------------------------------------------

export async function listRunningCosts(
  deps: Pick<InputsDeps, 'runningCosts'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<RunningCost[], Forbidden>> {
  if (!canManageCosts(caller, companyId)) return forbidden();
  return ok(await deps.runningCosts.listForCompany(companyId));
}

export async function addRunningCost(
  deps: InputsDeps,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  input: {
    readonly vehicleId?: VehicleId | undefined;
    readonly description: string;
    readonly monthlyPence: number;
    readonly fromMonth: string;
  },
): Promise<Result<RunningCost, Forbidden | InvalidRunningCost | VehicleNotFound>> {
  if (!canManageCosts(caller, companyId)) return forbidden();
  const fields = validateRunningCost(input);
  if (!fields.ok) return fields;
  if (input.vehicleId !== undefined) {
    const vehicle = await deps.vehicles.find(input.vehicleId);
    if (vehicle === null || vehicle.companyId !== companyId) return err({ tag: 'VehicleNotFound' });
  }
  const cost: RunningCost = {
    id: makeId<'RunningCostId'>(deps.ids.newId()),
    companyId,
    vehicleId: input.vehicleId,
    ...fields.value,
    toMonth: undefined,
  };
  await deps.runningCosts.insert(cost, staffId, deps.clock.now());
  return ok(cost);
}

/** Changes the amount (or the words) from a month on. Earlier months keep what they had. */
export async function changeRunningCost(
  deps: InputsDeps,
  caller: StaffCaller,
  staffId: StaffId,
  id: RunningCostId,
  input: {
    readonly description: string;
    readonly monthlyPence: number;
    readonly fromMonth: string;
  },
): Promise<Result<RunningCost, Forbidden | NotFound | InvalidRunningCost | InvalidCostChange>> {
  const existing = await deps.runningCosts.findById(id);
  if (existing === null || !sees(caller, existing.companyId)) return err({ tag: 'NotFound' });
  if (!canManageCosts(caller, existing.companyId)) return forbidden();
  const fields = validateRunningCost(input);
  if (!fields.ok) return fields;
  const plan = planChange(existing, fields.value.fromMonth);
  if (!plan.ok) return plan;
  const values = { description: fields.value.description, monthlyPence: fields.value.monthlyPence };
  if (plan.value.kind === 'update') {
    await deps.runningCosts.updateFields(id, values);
    return ok({ ...existing, ...values });
  }
  await deps.runningCosts.setToMonth(id, plan.value.closeTo);
  const next: RunningCost = {
    id: makeId<'RunningCostId'>(deps.ids.newId()),
    companyId: existing.companyId,
    vehicleId: existing.vehicleId,
    ...values,
    fromMonth: plan.value.newFrom,
    toMonth: existing.toMonth,
  };
  await deps.runningCosts.insert(next, staffId, deps.clock.now());
  return ok(next);
}

/** Stops a cost from a month on: it last applies the month before. Stopped from its first month, it is removed. */
export async function stopRunningCost(
  deps: InputsDeps,
  caller: StaffCaller,
  id: RunningCostId,
  fromMonth: string,
): Promise<Result<void, Forbidden | NotFound | InvalidRunningCost | InvalidCostChange>> {
  const existing = await deps.runningCosts.findById(id);
  if (existing === null || !sees(caller, existing.companyId)) return err({ tag: 'NotFound' });
  if (!canManageCosts(caller, existing.companyId)) return forbidden();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth)) {
    return err({ tag: 'InvalidRunningCost', reason: 'month' });
  }
  const plan = planStop(existing, fromMonth);
  if (!plan.ok) return plan;
  if (plan.value.kind === 'remove') await deps.runningCosts.delete(id);
  else await deps.runningCosts.setToMonth(id, plan.value.toMonth);
  return ok(undefined);
}

/** Removes an entry altogether, for one made by mistake. To end a cost that was real, stop it instead. */
export async function deleteRunningCost(
  deps: Pick<InputsDeps, 'runningCosts'>,
  caller: StaffCaller,
  id: RunningCostId,
): Promise<Result<void, Forbidden | NotFound>> {
  const existing = await deps.runningCosts.findById(id);
  if (existing === null || !sees(caller, existing.companyId)) return err({ tag: 'NotFound' });
  if (!canManageCosts(caller, existing.companyId)) return forbidden();
  await deps.runningCosts.delete(id);
  return ok(undefined);
}

// --- what drivers are paid ----------------------------------------------------------------------------------------

export interface DriverRates {
  readonly driverId: DriverId;
  readonly name: string;
  /** Newest first. */
  readonly rates: readonly DriverRate[];
}

/** Each of the company's drivers with the hourly rates they have had. A driver with no rate is listed with none. */
export async function listDriverRates(
  deps: Pick<InputsDeps, 'rates' | 'drivers'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<DriverRates[], Forbidden>> {
  if (!canManageCosts(caller, companyId)) return forbidden();
  const [drivers, rates] = await Promise.all([
    deps.drivers.listForCompany(companyId),
    deps.rates.listForCompany(companyId),
  ]);
  return ok(
    drivers.map((d) => ({
      driverId: d.id,
      name: d.name,
      rates: rates
        .filter((r) => r.driverId === d.id)
        .sort((a, b) => b.fromDay.localeCompare(a.fromDay)),
    })),
  );
}

/** What the driver costs an hour from a day on. Work done before it keeps the rate it had. */
export async function setDriverRate(
  deps: InputsDeps,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  input: { readonly driverId: DriverId; readonly hourlyPence: number; readonly fromDay: string },
): Promise<Result<DriverRate, Forbidden | InvalidRate | DriverNotFound>> {
  if (!canManageCosts(caller, companyId)) return forbidden();
  const fields = validateRate(input);
  if (!fields.ok) return fields;
  if (!(await deps.drivers.belongsToCompany(input.driverId, companyId))) {
    return err({ tag: 'DriverNotFound' });
  }
  const rate: DriverRate = {
    id: makeId<'DriverRateId'>(deps.ids.newId()),
    companyId,
    driverId: input.driverId,
    ...fields.value,
  };
  await deps.rates.upsert(rate, staffId, deps.clock.now());
  return ok(rate);
}

export async function deleteDriverRate(
  deps: Pick<InputsDeps, 'rates'>,
  caller: StaffCaller,
  id: DriverRateId,
): Promise<Result<void, Forbidden | NotFound>> {
  const existing = await deps.rates.findById(id);
  if (existing === null || !sees(caller, existing.companyId)) return err({ tag: 'NotFound' });
  if (!canManageCosts(caller, existing.companyId)) return forbidden();
  await deps.rates.delete(id);
  return ok(undefined);
}
