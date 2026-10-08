import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  appliesToVehicle,
  type CompanyId,
  type StaffId,
  type VehicleId,
} from '../domain/check-template.js';
import {
  isValidRetention,
  monthsAgo,
  startVerdict,
  type CheckSettings,
  type StartVerdict,
} from '../domain/settings.js';
import { ukDay } from '../domain/uk-day.js';
import type { CheckRepository } from './ports/check-repository.js';
import type { StaffCaller } from './ports/directories.js';
import type { OfficeCheckRepository } from './ports/office-check-repository.js';
import type { SettingsRepository } from './ports/settings-repository.js';
import type { TemplateRepository } from './ports/template-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;

export interface CheckRulesDeps {
  readonly settings: SettingsRepository;
  readonly templates: TemplateRepository;
  readonly checks: Pick<CheckRepository, 'doneOnDay'>;
  readonly office: Pick<OfficeCheckRepository, 'vehicleHasUnfixedDoNotDrive'>;
  readonly clock: Clock;
}

/** Anyone at the company may read its rules (the check screen will say why a job is held back); WagonWise staff any. */
function canView(caller: StaffCaller, companyId: CompanyId): boolean {
  return caller.kind === 'platform' || caller.companyId === companyId;
}

/** Choosing the firm's rules is a fleet job (`manage_fleet`); WagonWise staff can for any company. */
function canChange(caller: StaffCaller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId && caller.privileges.includes('manage_fleet'))
  );
}

export async function getCheckSettings(
  deps: Pick<CheckRulesDeps, 'settings'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<CheckSettings, Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.settings.get(companyId));
}

export type InvalidRetention = TaggedError<'InvalidRetention'>;

export interface CheckSettingsInput {
  readonly requiredBeforeJob: boolean;
  readonly blockOnDoNotDrive: boolean;
  /** Left out to keep what is set. */
  readonly retentionMonths?: number | undefined;
}

/** Saves the firm's rules and how long it keeps its records. The retention may be left out to keep what is set. */
export async function updateCheckSettings(
  deps: Pick<CheckRulesDeps, 'settings' | 'clock'>,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  input: CheckSettingsInput,
): Promise<Result<CheckSettings, Forbidden | InvalidRetention>> {
  if (!canChange(caller, companyId)) return err({ tag: 'Forbidden' });
  if (input.retentionMonths !== undefined && !isValidRetention(input.retentionMonths)) {
    return err({ tag: 'InvalidRetention' });
  }
  const current = await deps.settings.get(companyId);
  const saved: CheckSettings = {
    requiredBeforeJob: input.requiredBeforeJob,
    blockOnDoNotDrive: input.blockOnDoNotDrive,
    retentionMonths: input.retentionMonths ?? current.retentionMonths,
  };
  await deps.settings.save(companyId, saved, staffId, deps.clock.now());
  return ok(saved);
}

/**
 * Deletes each company's checks older than that company's retention (a firm with nothing set has 12 months). The check
 * goes with its photos and defects. A check with a defect still open or only seen is kept until the office marks it
 * fixed, so an unresolved fault is never lost to the clock. Returns how many checks were deleted, for the log.
 */
export async function pruneOldChecks(
  deps: Pick<CheckRulesDeps, 'settings' | 'clock'> & {
    readonly checks: Pick<CheckRepository, 'deleteOlderThan'>;
  },
  companyIds: readonly CompanyId[],
): Promise<number> {
  const now = deps.clock.now();
  let removed = 0;
  for (const companyId of companyIds) {
    const { retentionMonths } = await deps.settings.get(companyId);
    removed += await deps.checks.deleteOlderThan(companyId, monthsAgo(now, retentionMonths));
  }
  return removed;
}

/**
 * What the firm's rules say about a driver accepting a job on this vehicle. Asked by the job flow when the driver
 * accepts, in the driver's own request. A firm that has turned nothing on is answered without looking anything up.
 */
export async function jobStartVerdict(
  deps: CheckRulesDeps,
  companyId: CompanyId,
  vehicleId: VehicleId,
): Promise<StartVerdict> {
  const settings = await deps.settings.get(companyId);
  if (!settings.requiredBeforeJob && !settings.blockOnDoNotDrive) return 'ok';

  const hasUnfixedDoNotDrive = settings.blockOnDoNotDrive
    ? await deps.office.vehicleHasUnfixedDoNotDrive(vehicleId)
    : false;

  let listsStillToDo = 0;
  if (settings.requiredBeforeJob) {
    const today = ukDay(deps.clock.now());
    const lists = (await deps.templates.listForCompany(companyId)).filter((t) =>
      appliesToVehicle(t, vehicleId),
    );
    for (const list of lists) {
      if (!(await deps.checks.doneOnDay(list.id, vehicleId, today))) listsStillToDo += 1;
    }
  }
  return startVerdict({ settings, listsStillToDo, hasUnfixedDoNotDrive });
}
