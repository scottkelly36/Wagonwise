import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  appliesToVehicle,
  type CompanyId,
  type StaffId,
  type VehicleId,
} from '../domain/check-template.js';
import { startVerdict, type CheckSettings, type StartVerdict } from '../domain/settings.js';
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

export async function updateCheckSettings(
  deps: Pick<CheckRulesDeps, 'settings' | 'clock'>,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  settings: CheckSettings,
): Promise<Result<CheckSettings, Forbidden>> {
  if (!canChange(caller, companyId)) return err({ tag: 'Forbidden' });
  const saved: CheckSettings = {
    requiredBeforeJob: settings.requiredBeforeJob,
    blockOnDoNotDrive: settings.blockOnDoNotDrive,
  };
  await deps.settings.save(companyId, saved, staffId, deps.clock.now());
  return ok(saved);
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
