import { isActiveIn, type MonthString, type RunningCost } from './inputs.js';
import type { CostReport } from './job-costs.js';

const index = (month: MonthString): number => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};
const fromIndex = (i: number): MonthString =>
  `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** The `count` months ending at `end`, oldest first. */
export const monthsEndingAt = (end: MonthString, count: number): MonthString[] =>
  Array.from({ length: count }, (_, i) => fromIndex(index(end) - (count - 1 - i)));

export const addMonths = (month: MonthString, n: number): MonthString =>
  fromIndex(index(month) + n);

/** How many of the most recent complete months the forecast averages. */
export const FORECAST_BASIS = 3;
/** How many months ahead it looks. */
export const FORECAST_MONTHS = 3;

export interface MonthActual {
  readonly month: MonthString;
  /** The current month, still going: shown, but not used to forecast. */
  readonly partial: boolean;
  readonly jobs: number;
  readonly revenuePence: number;
  readonly wagesPence: number;
  /** All fuel bought in the month, matched to a vehicle or not. */
  readonly fuelPence: number;
  readonly runningPence: number;
  readonly overheadsPence: number;
  readonly costPence: number;
  readonly profitPence: number;
}

export interface MonthForecast {
  readonly month: MonthString;
  readonly revenuePence: number;
  readonly wagesPence: number;
  readonly fuelPence: number;
  /** What the firm already pays: the running costs and overheads that apply in that month. */
  readonly runningPence: number;
  readonly overheadsPence: number;
  readonly costPence: number;
  readonly profitPence: number;
}

export interface Forecast {
  /** The complete months it was worked from. */
  readonly basedOn: readonly MonthString[];
  readonly months: readonly MonthForecast[];
  /** The revenue a month needs to cover the costs forecast for it (the typical month ahead). */
  readonly breakEvenRevenuePence: number;
}

export interface Outlook {
  readonly history: readonly MonthActual[];
  /** `undefined` when no complete month has any delivered job to work from. */
  readonly forecast: Forecast | undefined;
}

const round = (n: number): number => Math.round(n);

/** One month's report as a row of the history. */
export function actualFrom(report: CostReport, partial: boolean): MonthActual {
  const t = report.totals;
  const costPence = t.wagesPence + t.fuelPence + t.runningPence + t.overheadsPence;
  return {
    month: report.month,
    partial,
    jobs: t.jobs,
    revenuePence: t.revenuePence,
    wagesPence: t.wagesPence,
    fuelPence: t.fuelPence,
    runningPence: t.runningPence,
    overheadsPence: t.overheadsPence,
    costPence,
    profitPence: t.revenuePence - costPence,
  };
}

/**
 * A look ahead from what has already happened, plainly:
 * - revenue, wages and fuel are each the **average of the last three complete months that had jobs** (they move with how
 *   much work there is, so the recent average is the best plain guess);
 * - running costs and overheads are **what the firm already pays** in each month ahead, taken from the costs entered (they
 *   are known, so they are not averaged).
 * It is a guide, not a promise: it assumes the work carries on as it has, and says which months it is built from. With no
 * complete month of jobs there is nothing to build on, and it does not invent a forecast.
 */
export function buildOutlook(input: {
  readonly history: readonly MonthActual[];
  readonly runningCosts: readonly RunningCost[];
  readonly currentMonth: MonthString;
}): Outlook {
  const basis = input.history.filter((m) => !m.partial && m.jobs > 0).slice(-FORECAST_BASIS);
  if (basis.length === 0) return { history: input.history, forecast: undefined };
  const avg = (f: (m: MonthActual) => number): number =>
    round(basis.reduce((s, m) => s + f(m), 0) / basis.length);
  const revenuePence = avg((m) => m.revenuePence);
  const wagesPence = avg((m) => m.wagesPence);
  const fuelPence = avg((m) => m.fuelPence);

  const months: MonthForecast[] = Array.from({ length: FORECAST_MONTHS }, (_, i) => {
    const month = addMonths(input.currentMonth, i + 1);
    let runningPence = 0;
    let overheadsPence = 0;
    for (const c of input.runningCosts) {
      if (!isActiveIn(c, month)) continue;
      if (c.vehicleId === undefined) overheadsPence += c.monthlyPence;
      else runningPence += c.monthlyPence;
    }
    const costPence = wagesPence + fuelPence + runningPence + overheadsPence;
    return {
      month,
      revenuePence,
      wagesPence,
      fuelPence,
      runningPence,
      overheadsPence,
      costPence,
      profitPence: revenuePence - costPence,
    };
  });
  const typicalCost = round(months.reduce((s, m) => s + m.costPence, 0) / months.length);
  return {
    history: input.history,
    forecast: { basedOn: basis.map((m) => m.month), months, breakEvenRevenuePence: typicalCost },
  };
}
