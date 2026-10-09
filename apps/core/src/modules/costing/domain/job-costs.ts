import type { FuelTransaction, VehicleId } from './fuel.js';
import {
  isActiveIn,
  rateOn,
  type DriverId,
  type DriverRate,
  type MonthString,
  type RunningCost,
} from './inputs.js';

const HOUR_MS = 3_600_000;

/** A job delivered in the month, as costing needs it. Supplied by composition over `jobs`. */
export interface DeliveredJob {
  readonly id: string;
  readonly reference: string;
  readonly customer: string | undefined;
  readonly pricePence: number | undefined;
  readonly vehicleId: VehicleId | undefined;
  readonly driverId: DriverId | undefined;
  /** When the driver accepted it, and when it was delivered. */
  readonly acceptedAt: Date | undefined;
  readonly deliveredAt: Date;
}

// --- the UK calendar --------------------------------------------------------------------------------------------

/** The UK day (`YYYY-MM-DD`) an instant falls on. */
export function ukDay(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The first moment of the UK day: midnight in London, which is an hour earlier in UTC while summer time is on. */
function ukMidnight(year: number, monthIndex: number, day: number): Date {
  const utcMidnight = Date.UTC(year, monthIndex, day);
  const hourInLondon = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(utcMidnight))
      .find((p) => p.type === 'hour')?.value ?? '0',
  );
  return new Date(utcMidnight - hourInLondon * HOUR_MS);
}

/** A month as the UK lives it: from midnight on the 1st (London time) up to, not including, midnight on the 1st of the next. */
export function ukMonthRange(month: MonthString): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: ukMidnight(y, m - 1, 1), to: ukMidnight(y, m, 1) };
}

// --- sharing a cost out ------------------------------------------------------------------------------------------

/**
 * Splits `totalPence` across the weights in whole pence, in proportion, so the shares add up to the total exactly (the
 * pennies lost to rounding go to the shares with the biggest remainders). With no weight to share by, every share is nothing.
 */
export function allocate(totalPence: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalPence * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let left = totalPence - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

// --- the report -------------------------------------------------------------------------------------------------

export type JobNote = 'no_price' | 'no_time' | 'no_rate' | 'no_driver' | 'no_vehicle';

export interface JobCost {
  readonly jobId: string;
  readonly reference: string;
  readonly customer: string | undefined;
  readonly vehicleId: VehicleId | undefined;
  readonly vehicleName: string | undefined;
  readonly driverName: string | undefined;
  readonly deliveredAt: Date;
  /** Hours from the driver accepting the job to delivery; zero when that is not known. */
  readonly hours: number;
  readonly pricePence: number | undefined;
  /** `undefined` when the driver has no rate (so the figure is not a guess of nothing). */
  readonly wagesPence: number | undefined;
  readonly fuelPence: number;
  readonly runningPence: number;
  /** Wages, fuel and the vehicle's running costs that this job carries. */
  readonly costPence: number;
  /** `undefined` when the job has no price. */
  readonly profitPence: number | undefined;
  readonly notes: readonly JobNote[];
}

export interface VehicleCost {
  readonly vehicleId: VehicleId | undefined;
  readonly name: string;
  readonly jobs: number;
  readonly hours: number;
  readonly revenuePence: number;
  readonly wagesPence: number;
  /** All the fuel bought for the vehicle in the month, whether or not it did a job. */
  readonly fuelPence: number;
  /** All its running costs for the month, whether or not it did a job. */
  readonly runningPence: number;
  readonly costPence: number;
  readonly profitPence: number;
}

export interface CustomerCost {
  readonly name: string;
  readonly jobs: number;
  readonly revenuePence: number;
  readonly costPence: number;
  readonly profitPence: number;
}

export interface CostReport {
  readonly month: MonthString;
  readonly jobs: readonly JobCost[];
  readonly vehicles: readonly VehicleCost[];
  readonly customers: readonly CustomerCost[];
  readonly totals: {
    readonly jobs: number;
    readonly revenuePence: number;
    readonly wagesPence: number;
    /** All fuel in the month, matched to a vehicle or not. */
    readonly fuelPence: number;
    /** Fuel that matched no vehicle, so it is on no job. */
    readonly unmatchedFuelPence: number;
    readonly runningPence: number;
    /** The firm's overheads, shown on their own and not added to any job. */
    readonly overheadsPence: number;
    /** What the jobs carry: wages, and the fuel and running costs of vehicles that did jobs. */
    readonly jobsCostPence: number;
    /** Vehicle costs of vehicles that did no job, and fuel matched to no vehicle: costs no job carries. */
    readonly notCoveredPence: number;
    /** Revenue less every cost above, overheads included. */
    readonly profitPence: number;
    readonly jobsWithoutPrice: number;
    readonly jobsWithoutRate: number;
  };
}

/**
 * Works out what each job delivered in `month` cost, and what each vehicle and customer made.
 *
 * A job's time runs from the driver accepting it to delivery. **Wages** are that time at the driver's rate on the day it was
 * delivered. **Fuel** bought for a vehicle in the month, and the vehicle's **running costs** for the month, are shared across
 * the vehicle's jobs in proportion to their time, to the penny, so a vehicle's jobs together carry all of what it cost that
 * month. A vehicle that did no job carries nothing on any job; its costs show on the vehicle and as not covered by a job.
 * **Overheads** belong to the firm and are not put on a job. A driver with no rate adds no wages and the job says so; a job
 * with no price has no profit.
 */
export function buildCostReport(input: {
  readonly month: MonthString;
  readonly jobs: readonly DeliveredJob[];
  readonly fuel: readonly FuelTransaction[];
  readonly runningCosts: readonly RunningCost[];
  readonly rates: readonly DriverRate[];
  readonly vehicleNames: ReadonlyMap<string, string>;
  readonly driverNames: ReadonlyMap<string, string>;
}): CostReport {
  const month = input.month;
  const active = input.runningCosts.filter((c) => isActiveIn(c, month));

  const hoursOf = (job: DeliveredJob): number =>
    job.acceptedAt === undefined
      ? 0
      : Math.max(0, (job.deliveredAt.getTime() - job.acceptedAt.getTime()) / HOUR_MS);

  const fuelByVehicle = new Map<string, number>();
  let unmatchedFuel = 0;
  for (const t of input.fuel) {
    if (t.vehicleId === undefined) unmatchedFuel += t.amountPence;
    else fuelByVehicle.set(t.vehicleId, (fuelByVehicle.get(t.vehicleId) ?? 0) + t.amountPence);
  }
  const runningByVehicle = new Map<string, number>();
  let overheads = 0;
  for (const c of active) {
    if (c.vehicleId === undefined) overheads += c.monthlyPence;
    else
      runningByVehicle.set(c.vehicleId, (runningByVehicle.get(c.vehicleId) ?? 0) + c.monthlyPence);
  }

  // Each vehicle's fuel and running costs, shared across its jobs by time.
  const jobsByVehicle = new Map<string, DeliveredJob[]>();
  for (const job of input.jobs) {
    if (job.vehicleId === undefined) continue;
    jobsByVehicle.set(job.vehicleId, [...(jobsByVehicle.get(job.vehicleId) ?? []), job]);
  }
  const fuelShare = new Map<string, number>();
  const runningShare = new Map<string, number>();
  for (const [vehicleId, jobs] of jobsByVehicle) {
    const weights = jobs.map(hoursOf);
    // With no time on any of them, share equally rather than lose the cost.
    const effective = weights.every((w) => w === 0) ? weights.map(() => 1) : weights;
    allocate(fuelByVehicle.get(vehicleId) ?? 0, effective).forEach((p, i) =>
      fuelShare.set((jobs[i] as DeliveredJob).id, p),
    );
    allocate(runningByVehicle.get(vehicleId) ?? 0, effective).forEach((p, i) =>
      runningShare.set((jobs[i] as DeliveredJob).id, p),
    );
  }

  const jobCosts: JobCost[] = input.jobs
    .map((job): JobCost => {
      const hours = hoursOf(job);
      const rate =
        job.driverId === undefined
          ? undefined
          : rateOn(input.rates, job.driverId, ukDay(job.deliveredAt));
      const wagesPence = rate === undefined ? undefined : Math.round(hours * rate);
      const fuelPence = fuelShare.get(job.id) ?? 0;
      const runningPence = runningShare.get(job.id) ?? 0;
      const costPence = (wagesPence ?? 0) + fuelPence + runningPence;
      const notes: JobNote[] = [];
      if (job.pricePence === undefined) notes.push('no_price');
      if (hours === 0) notes.push('no_time');
      if (job.driverId === undefined) notes.push('no_driver');
      else if (rate === undefined) notes.push('no_rate');
      if (job.vehicleId === undefined) notes.push('no_vehicle');
      return {
        jobId: job.id,
        reference: job.reference,
        customer: job.customer,
        vehicleId: job.vehicleId,
        vehicleName:
          job.vehicleId === undefined ? undefined : input.vehicleNames.get(job.vehicleId),
        driverName: job.driverId === undefined ? undefined : input.driverNames.get(job.driverId),
        deliveredAt: job.deliveredAt,
        hours: Math.round(hours * 100) / 100,
        pricePence: job.pricePence,
        wagesPence,
        fuelPence,
        runningPence,
        costPence,
        profitPence: job.pricePence === undefined ? undefined : job.pricePence - costPence,
        notes,
      };
    })
    .sort((a, b) => b.deliveredAt.getTime() - a.deliveredAt.getTime());

  // By vehicle: every vehicle that did a job or had a cost this month.
  const vehicleIds = new Set<string>([
    ...jobsByVehicle.keys(),
    ...fuelByVehicle.keys(),
    ...runningByVehicle.keys(),
  ]);
  const vehicles: VehicleCost[] = [...vehicleIds]
    .map((id): VehicleCost => {
      const mine = jobCosts.filter((j) => j.vehicleId === id);
      const fuelPence = fuelByVehicle.get(id) ?? 0;
      const runningPence = runningByVehicle.get(id) ?? 0;
      const wagesPence = mine.reduce((s, j) => s + (j.wagesPence ?? 0), 0);
      const revenuePence = mine.reduce((s, j) => s + (j.pricePence ?? 0), 0);
      const costPence = wagesPence + fuelPence + runningPence;
      return {
        vehicleId: id as VehicleId,
        name: input.vehicleNames.get(id) ?? 'A vehicle',
        jobs: mine.length,
        hours: Math.round(mine.reduce((s, j) => s + j.hours, 0) * 100) / 100,
        revenuePence,
        wagesPence,
        fuelPence,
        runningPence,
        costPence,
        profitPence: revenuePence - costPence,
      };
    })
    .sort((a, b) => a.profitPence - b.profitPence || a.name.localeCompare(b.name));
  // Jobs with no vehicle still have wages and revenue; they are one more line.
  const unassigned = jobCosts.filter((j) => j.vehicleId === undefined);
  if (unassigned.length > 0) {
    const wagesPence = unassigned.reduce((s, j) => s + (j.wagesPence ?? 0), 0);
    const revenuePence = unassigned.reduce((s, j) => s + (j.pricePence ?? 0), 0);
    vehicles.push({
      vehicleId: undefined,
      name: 'No vehicle recorded',
      jobs: unassigned.length,
      hours: Math.round(unassigned.reduce((s, j) => s + j.hours, 0) * 100) / 100,
      revenuePence,
      wagesPence,
      fuelPence: 0,
      runningPence: 0,
      costPence: wagesPence,
      profitPence: revenuePence - wagesPence,
    });
  }

  // By customer.
  const byCustomer = new Map<string, { jobs: number; revenue: number; cost: number }>();
  for (const j of jobCosts) {
    const name = j.customer ?? 'No customer';
    const line = byCustomer.get(name) ?? { jobs: 0, revenue: 0, cost: 0 };
    byCustomer.set(name, {
      jobs: line.jobs + 1,
      revenue: line.revenue + (j.pricePence ?? 0),
      cost: line.cost + j.costPence,
    });
  }
  const customers: CustomerCost[] = [...byCustomer]
    .map(([name, l]) => ({
      name,
      jobs: l.jobs,
      revenuePence: l.revenue,
      costPence: l.cost,
      profitPence: l.revenue - l.cost,
    }))
    .sort((a, b) => b.profitPence - a.profitPence || a.name.localeCompare(b.name));

  const sum = (f: (j: JobCost) => number): number => jobCosts.reduce((s, j) => s + f(j), 0);
  const fuelAll = [...fuelByVehicle.values()].reduce((a, b) => a + b, 0) + unmatchedFuel;
  const runningAll = [...runningByVehicle.values()].reduce((a, b) => a + b, 0);
  const wages = sum((j) => j.wagesPence ?? 0);
  const revenue = sum((j) => j.pricePence ?? 0);
  const jobsCost = sum((j) => j.costPence);
  const notCovered = fuelAll + runningAll - (jobsCost - wages);
  return {
    month,
    jobs: jobCosts,
    vehicles,
    customers,
    totals: {
      jobs: jobCosts.length,
      revenuePence: revenue,
      wagesPence: wages,
      fuelPence: fuelAll,
      unmatchedFuelPence: unmatchedFuel,
      runningPence: runningAll,
      overheadsPence: overheads,
      jobsCostPence: jobsCost,
      notCoveredPence: notCovered,
      profitPence: revenue - wages - fuelAll - runningAll - overheads,
      jobsWithoutPrice: jobCosts.filter((j) => j.pricePence === undefined).length,
      jobsWithoutRate: jobCosts.filter((j) => j.notes.includes('no_rate')).length,
    },
  };
}
