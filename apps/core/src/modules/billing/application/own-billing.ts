import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { makeId } from '../../../shared/brand.js';
import type { Invoice } from '../domain/invoice.js';
import {
  DEFAULT_PRICE_PER_VEHICLE_PENCE,
  capacityOn,
  nextChangeAfter,
  ukDay,
  type DayString,
} from '../domain/plan.js';
import type { Forbidden } from './billing-details.js';
import type { StaffCaller } from './ports/directories.js';
import type { InvoiceRepository } from './ports/invoice-repository.js';
import type { PlanRepository } from './ports/plan-repository.js';
import type { VehicleCount } from './ports/vehicle-count.js';

export interface OwnBillingDeps {
  readonly plans: PlanRepository;
  readonly invoices: InvoiceRepository;
  readonly vehicles: VehicleCount;
  readonly clock: Clock;
}

export interface OwnPlan {
  readonly capacityToday: number;
  readonly vehiclesInUse: number;
  readonly pricePerVehiclePence: number;
  readonly monthlyPence: number;
  readonly next: { readonly effectiveFrom: DayString; readonly capacity: number } | undefined;
}

/**
 * A company's own billing is for the people it has trusted with it (`manage_billing`), and for that company
 * only: the id is taken from who is calling, never from the request. WagonWise's own staff use the admin pages.
 */
function ownCompany(caller: StaffCaller) {
  return caller.kind === 'fleet' && caller.privileges.includes('manage_billing')
    ? makeId<'CompanyId'>(caller.companyId)
    : undefined;
}

/** What the company's plan covers, what it has, and what that costs a month. */
export async function ownPlan(
  deps: OwnBillingDeps,
  caller: StaffCaller,
): Promise<Result<OwnPlan, Forbidden>> {
  const companyId = ownCompany(caller);
  if (companyId === undefined) return err({ tag: 'Forbidden' });
  const [changes, prices, vehiclesInUse] = await Promise.all([
    deps.plans.listChanges(companyId),
    deps.plans.listPrices(),
    deps.vehicles.countFor(companyId),
  ]);
  const today = ukDay(deps.clock.now());
  const capacityToday = capacityOn(changes, today);
  const price = prices.get(companyId) ?? DEFAULT_PRICE_PER_VEHICLE_PENCE;
  const next = nextChangeAfter(changes, today);
  return ok({
    capacityToday,
    vehiclesInUse,
    pricePerVehiclePence: price,
    monthlyPence: capacityToday * price,
    next: next && { effectiveFrom: next.effectiveFrom, capacity: next.capacity },
  });
}

/** The company's issued, paid and cancelled invoices, newest first. Never a draft. */
export async function ownInvoices(
  deps: Pick<OwnBillingDeps, 'invoices'>,
  caller: StaffCaller,
): Promise<Result<Invoice[], Forbidden>> {
  const companyId = ownCompany(caller);
  if (companyId === undefined) return err({ tag: 'Forbidden' });
  return ok(await deps.invoices.listIssuedForCompany(companyId));
}
