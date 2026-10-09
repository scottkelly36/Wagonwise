import type { MonthActualDto, MonthForecastDto, OutlookDto } from '@wagonwise/contracts/costing';

/** How far to push each moving part, in whole percent. Running costs and overheads are already known, so they do not move. */
export interface WhatIf {
  /** Revenue: more or less work, or better or worse prices. */
  readonly revenuePct: number;
  /** What fuel costs. */
  readonly fuelPct: number;
  /** What the drivers cost. */
  readonly wagesPct: number;
}

export const NO_CHANGE: WhatIf = { revenuePct: 0, fuelPct: 0, wagesPct: 0 };

export const isChanged = (w: WhatIf): boolean =>
  w.revenuePct !== 0 || w.fuelPct !== 0 || w.wagesPct !== 0;

const scale = (pence: number, pct: number): number => Math.round((pence * (100 + pct)) / 100);

/** A forecast month with the what-if applied to revenue, fuel and wages, and the cost and profit worked out again. */
export function applyWhatIf(month: MonthForecastDto, w: WhatIf): MonthForecastDto {
  const revenuePence = scale(month.revenuePence, w.revenuePct);
  const fuelPence = scale(month.fuelPence, w.fuelPct);
  const wagesPence = scale(month.wagesPence, w.wagesPct);
  const costPence = wagesPence + fuelPence + month.runningPence + month.overheadsPence;
  return {
    ...month,
    revenuePence,
    fuelPence,
    wagesPence,
    costPence,
    profitPence: revenuePence - costPence,
  };
}

/** The revenue a typical month ahead needs to cover its costs: the average cost of the months given. */
export function breakEven(months: readonly MonthForecastDto[]): number {
  if (months.length === 0) return 0;
  return Math.round(months.reduce((s, m) => s + m.costPence, 0) / months.length);
}

export interface ChartMonth {
  readonly month: string;
  readonly revenue: number;
  readonly cost: number;
  readonly revenuePence: number;
  readonly costPence: number;
  readonly forecast: boolean;
  readonly partial: boolean;
}

/** The months to draw: the history then the forecast, each bar a share (0 to 1) of the biggest figure shown. */
export function chartMonths(
  history: readonly MonthActualDto[],
  forecast: readonly MonthForecastDto[],
): ChartMonth[] {
  const all = [
    ...history.map((m) => ({ ...m, forecast: false, partial: m.partial })),
    ...forecast.map((m) => ({ ...m, forecast: true, partial: false })),
  ];
  const top = Math.max(1, ...all.flatMap((m) => [m.revenuePence, m.costPence]));
  return all.map((m) => ({
    month: m.month,
    revenue: m.revenuePence / top,
    cost: m.costPence / top,
    revenuePence: m.revenuePence,
    costPence: m.costPence,
    forecast: m.forecast,
    partial: m.partial,
  }));
}

/** The forecast months with the what-if applied, and what they come to together; `undefined` with no forecast. */
export function forecastWith(
  outlook: OutlookDto,
  w: WhatIf,
):
  | {
      months: MonthForecastDto[];
      totalProfitPence: number;
      breakEvenRevenuePence: number;
      revenuePence: number;
    }
  | undefined {
  if (outlook.forecast === undefined) return undefined;
  const months = outlook.forecast.months.map((m) => applyWhatIf(m, w));
  return {
    months,
    totalProfitPence: months.reduce((s, m) => s + m.profitPence, 0),
    breakEvenRevenuePence: breakEven(months),
    revenuePence: months[0]?.revenuePence ?? 0,
  };
}
