import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId } from '../domain/fuel.js';
import { isMonth } from '../domain/inputs.js';
import { buildCostReport, ukMonthRange, type CostReport } from '../domain/job-costs.js';
import { canManageCosts, type Forbidden } from './inputs.js';
import type {
  DriverDirectory,
  DriverRateRepository,
  JobDirectory,
  RunningCostRepository,
} from './inputs-ports.js';
import type { FuelRepository, StaffCaller, VehicleDirectory } from './ports.js';

export type InvalidMonth = TaggedError<'InvalidMonth'>;

export interface JobCostReportDeps {
  readonly fuel: FuelRepository;
  readonly runningCosts: RunningCostRepository;
  readonly rates: DriverRateRepository;
  readonly jobs: JobDirectory;
  readonly vehicles: VehicleDirectory;
  readonly drivers: DriverDirectory;
}

/**
 * What each job delivered in a month cost, and what each vehicle and customer made (`domain/job-costs.ts` has the sums).
 * It reads the firm's wages, so it needs `manage_billing` like the costs it is built from.
 */
export async function jobCostReport(
  deps: JobCostReportDeps,
  caller: StaffCaller,
  companyId: CompanyId,
  month: string,
): Promise<Result<CostReport, Forbidden | InvalidMonth>> {
  if (!canManageCosts(caller, companyId)) return err({ tag: 'Forbidden' });
  if (!isMonth(month)) return err({ tag: 'InvalidMonth' });
  const { from, to } = ukMonthRange(month);
  const [jobs, fuel, runningCosts, rates, vehicles, drivers] = await Promise.all([
    deps.jobs.deliveredBetween(companyId, from, to),
    deps.fuel.listBetween(companyId, from, to),
    deps.runningCosts.listForCompany(companyId),
    deps.rates.listForCompany(companyId),
    deps.vehicles.listForCompany(companyId),
    deps.drivers.listForCompany(companyId),
  ]);
  return ok(
    buildCostReport({
      month,
      jobs,
      fuel,
      runningCosts,
      rates,
      vehicleNames: new Map(vehicles.map((v) => [v.id, v.name])),
      driverNames: new Map(drivers.map((d) => [d.id, d.name])),
    }),
  );
}
