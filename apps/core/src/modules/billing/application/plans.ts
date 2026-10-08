import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { StaffId } from '../domain/billing-details.js';
import {
  DEFAULT_PRICE_PER_VEHICLE_PENCE,
  capacityOn,
  nextChangeAfter,
  ukDay,
  validateCapacity,
  validateDay,
  validatePrice,
  type CapacityChange,
  type CompanyId,
  type DayInPast,
  type DayString,
  type InvalidCapacity,
  type InvalidDay,
  type InvalidPrice,
} from '../domain/plan.js';
import type { Forbidden } from './billing-details.js';
import type { CompanyDirectory } from './ports/company-directory.js';
import type { StaffCaller } from './ports/directories.js';
import type { PlanRepository } from './ports/plan-repository.js';

export type CompanyNotFound = TaggedError<'CompanyNotFound'>;

export interface PlanDeps {
  readonly plans: PlanRepository;
  readonly companies: CompanyDirectory;
  readonly clock: Clock;
}

export interface PlanSummary {
  readonly companyId: CompanyId;
  readonly name: string;
  readonly pricePerVehiclePence: number;
  /** Vehicles the plan covers today. */
  readonly capacityToday: number;
  /** The next change still to come, if one is scheduled. */
  readonly next: { readonly effectiveFrom: DayString; readonly capacity: number } | undefined;
  /** What a month at today's capacity costs, in pence. */
  readonly monthlyPence: number;
}

const isAdmin = (caller: StaffCaller): boolean => caller.kind === 'platform';

/** Every company with its price and today's capacity, A to Z. WagonWise admins only. */
export async function listPlans(
  deps: PlanDeps,
  caller: StaffCaller,
): Promise<Result<PlanSummary[], Forbidden>> {
  if (!isAdmin(caller)) return err({ tag: 'Forbidden' });
  const [companies, prices, changes] = await Promise.all([
    deps.companies.list(),
    deps.plans.listPrices(),
    deps.plans.listAllChanges(),
  ]);
  const today = ukDay(deps.clock.now());
  const summaries = companies.map((company): PlanSummary => {
    const own = changes.filter((c) => c.companyId === company.id);
    const capacityToday = capacityOn(own, today);
    const price = prices.get(company.id) ?? DEFAULT_PRICE_PER_VEHICLE_PENCE;
    const next = nextChangeAfter(own, today);
    return {
      companyId: company.id,
      name: company.name,
      pricePerVehiclePence: price,
      capacityToday,
      next: next && { effectiveFrom: next.effectiveFrom, capacity: next.capacity },
      monthlyPence: capacityToday * price,
    };
  });
  return ok(summaries.sort((a, b) => a.name.localeCompare(b.name)));
}

/** A company's capacity changes, newest first. WagonWise admins only. */
export async function capacityHistory(
  deps: PlanDeps,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<CapacityChange[], Forbidden | CompanyNotFound>> {
  if (!isAdmin(caller)) return err({ tag: 'Forbidden' });
  if (!(await companyExists(deps, companyId))) return err({ tag: 'CompanyNotFound' });
  const changes = await deps.plans.listChanges(companyId);
  return ok([...changes].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)));
}

export async function setPricePerVehicle(
  deps: PlanDeps,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  pence: number,
): Promise<Result<number, Forbidden | CompanyNotFound | InvalidPrice>> {
  if (!isAdmin(caller)) return err({ tag: 'Forbidden' });
  const price = validatePrice(pence);
  if (!price.ok) return price;
  if (!(await companyExists(deps, companyId))) return err({ tag: 'CompanyNotFound' });
  await deps.plans.setPrice(companyId, price.value, staffId, deps.clock.now());
  return ok(price.value);
}

/**
 * From `effectiveFrom`, the company's plan covers `capacity` vehicles. The day is today or later: a past
 * day would change what an earlier month was billed. Setting it again for the same day replaces it.
 * Lowering capacity below the vehicles a company already has is allowed; it only stops them adding more.
 */
export async function scheduleCapacity(
  deps: PlanDeps,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  input: { readonly capacity: number; readonly effectiveFrom: string },
): Promise<
  Result<CapacityChange, Forbidden | CompanyNotFound | InvalidCapacity | InvalidDay | DayInPast>
> {
  if (!isAdmin(caller)) return err({ tag: 'Forbidden' });
  const capacity = validateCapacity(input.capacity);
  if (!capacity.ok) return capacity;
  const day = validateDay(input.effectiveFrom);
  if (!day.ok) return day;
  if (day.value < ukDay(deps.clock.now())) return err({ tag: 'DayInPast' });
  if (!(await companyExists(deps, companyId))) return err({ tag: 'CompanyNotFound' });
  const change: CapacityChange = {
    companyId,
    effectiveFrom: day.value,
    capacity: capacity.value,
  };
  await deps.plans.setCapacity(change, staffId, deps.clock.now());
  return ok(change);
}

/** How many vehicles a company's plan covers today. No caller: this is the check fleet makes when a
 *  vehicle is created, whoever creates it. A company with no plan covers none. */
export async function vehicleCapacityToday(
  deps: Pick<PlanDeps, 'plans' | 'clock'>,
  companyId: CompanyId,
): Promise<number> {
  return capacityOn(await deps.plans.listChanges(companyId), ukDay(deps.clock.now()));
}

async function companyExists(deps: PlanDeps, companyId: CompanyId): Promise<boolean> {
  return (await deps.companies.list()).some((c) => c.id === companyId);
}
