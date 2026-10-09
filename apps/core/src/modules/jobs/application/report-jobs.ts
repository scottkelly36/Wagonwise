import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, DriverId, VehicleId } from '../domain/job.js';
import {
  jobReportRow,
  summariseJobReport,
  type JobReportRow,
  type JobReportSummary,
} from '../domain/report.js';
import { canViewReports } from './authorization.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { DriverIdentityDirectory, VehicleNameDirectory } from './ports/directories.js';
import type { JobRepository } from './ports/job-repository.js';

export interface ReportJobsDeps {
  readonly repo: Pick<JobRepository, 'listForCompany'>;
  readonly drivers: DriverIdentityDirectory;
  readonly vehicles: VehicleNameDirectory;
}

export interface JobReportRowWithNames extends JobReportRow {
  /** The driver's sign-in and the vehicle's name, when the job has them and they can be found. */
  readonly driver?: string | undefined;
  readonly vehicle?: string | undefined;
}

export interface JobReport {
  readonly rows: JobReportRowWithNames[];
  readonly summary: JobReportSummary;
}

/**
 * The company's jobs with any activity in `[from, to)`, newest first, each with the milestones read off
 * its timeline and who drove what (P2-M8). "Any activity" means a status change in the period (created,
 * assigned, accepted, delivered ...), so a job that was created last week and delivered today appears in
 * both weeks' reports, and one still going appears while it is being worked. Needs `view_reports`.
 */
export async function reportJobs(
  deps: ReportJobsDeps,
  input: {
    readonly caller: Caller;
    readonly companyId: CompanyId;
    readonly from: Date;
    readonly to: Date;
  },
): Promise<Result<JobReport, Forbidden>> {
  if (!canViewReports(input.caller, input.companyId)) return err({ tag: 'Forbidden' });

  const jobs = (await deps.repo.listForCompany(input.companyId)).filter((job) =>
    job.timeline.some(
      (entry) =>
        entry.at.getTime() >= input.from.getTime() && entry.at.getTime() < input.to.getTime(),
    ),
  );
  const rows = jobs
    .map(jobReportRow)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

  // Each driver and vehicle is looked up once, however many jobs they appear on.
  const driverNames = new Map<string, string | null>();
  for (const id of new Set(rows.flatMap((r) => (r.driverId === undefined ? [] : [r.driverId])))) {
    driverNames.set(id, await deps.drivers.getIdentifier(id as DriverId));
  }
  const vehicleNames = new Map<string, string | null>();
  for (const id of new Set(rows.flatMap((r) => (r.vehicleId === undefined ? [] : [r.vehicleId])))) {
    vehicleNames.set(id, await deps.vehicles.getName(id as VehicleId));
  }

  return ok({
    rows: rows.map((row) => ({
      ...row,
      driver: (row.driverId !== undefined ? driverNames.get(row.driverId) : undefined) ?? undefined,
      vehicle:
        (row.vehicleId !== undefined ? vehicleNames.get(row.vehicleId) : undefined) ?? undefined,
    })),
    summary: summariseJobReport(rows, { from: input.from, to: input.to }),
  });
}
