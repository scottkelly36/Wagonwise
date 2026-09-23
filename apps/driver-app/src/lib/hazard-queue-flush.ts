import type { ReportHazardRequest } from '@wagonwise/contracts/hazards';

export interface FlushResult {
  readonly sent: readonly string[];
  readonly remaining: readonly ReportHazardRequest[];
}

/**
 * Sends queued reports in order, one at a time, stopping at the first failure (design doc §5:
 * "Queue flushes to the BFF when online"). Pure orchestration — no SQLite, no `fetch` — `submit`
 * is injected so this is fully testable with fakes, the same split every I/O-adjacent piece of
 * logic in this app uses (`parseHazardReportForm`, `startWatchingPosition`).
 *
 * Stopping on the first failure rather than trying every item is a deliberate simplification: a
 * failure here is expected to mean "no connectivity," in which case every later item would fail
 * the same way, so trying them only wastes time and battery. It also means a genuine permanent
 * server-side rejection (not just connectivity) would sit retried-forever in the queue with no
 * distinct error surfaced — accepted because the one rule that could cause that
 * (`validateMeasurement`) is already enforced client-side before anything is ever queued
 * (`parseHazardReportForm`), so this case is expected to be unreachable in practice, not
 * unhandled by design.
 */
export async function flushQueuedReports(
  queued: readonly ReportHazardRequest[],
  submit: (request: ReportHazardRequest) => Promise<unknown>,
): Promise<FlushResult> {
  const sent: string[] = [];
  for (let index = 0; index < queued.length; index++) {
    const request = queued[index];
    if (request === undefined) continue;
    try {
      await submit(request);
      sent.push(request.id);
    } catch {
      return { sent, remaining: queued.slice(index) };
    }
  }
  return { sent, remaining: [] };
}
