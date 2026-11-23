import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import type { Forbidden } from './usage.js';
import type { StaffCaller } from './usage.js';

/** The window the portal report looks at. The events themselves are kept for 90 days. */
export const PORTAL_REPORT_DAYS = 30;
/** A company is "setting up" until its first job, for this many days after it was made. */
export const SETTING_UP_DAYS = 90;

export interface PortalReport {
  readonly windowDays: number;
  readonly sessions: number;
  readonly firms: number;
  /** Sessions that opened each page (only pages that were opened appear; the interface adds the rest with a zero). */
  readonly pages: readonly { readonly page: string; readonly sessions: number }[];
  readonly forms: readonly {
    readonly form: string;
    readonly opened: number;
    readonly sent: number;
    readonly left: number;
    readonly errors: number;
    readonly medianSecondsToSend: number | null;
  }[];
  readonly errorFields: readonly {
    readonly form: string;
    readonly field: string;
    readonly problem: string;
    readonly count: number;
  }[];
  readonly settingUp: readonly {
    readonly id: string;
    readonly name: string;
    readonly createdAt: Date;
    readonly vehicles: number;
    readonly drivers: number;
    readonly jobs: number;
    readonly lastSeenAt: Date | null;
  }[];
}

export interface PortalReportReader {
  read(now: Date): Promise<PortalReport>;
}

export interface PortalReportDeps {
  readonly reader: PortalReportReader;
  readonly clock: Clock;
}

/** The portal's own usage, for WagonWise staff only. */
export async function getPortalReport(
  deps: PortalReportDeps,
  caller: StaffCaller,
): Promise<Result<PortalReport, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return ok(await deps.reader.read(deps.clock.now()));
}
