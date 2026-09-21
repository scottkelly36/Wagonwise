import type { Result } from '../../../shared/result';

export type HazardReport = { id: string; heightLimitM?: number };

export function describe(report: HazardReport): Result<string, never> {
  return { ok: true, value: report.id };
}
