import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  validateTemplate,
  type CheckItem,
  type CheckTemplate,
  type CheckTemplateId,
  type CompanyId,
  type InvalidTemplate,
  type TemplateInput,
} from '../domain/check-template.js';
import { STARTER_NAME, starterItems } from '../domain/starter-template.js';
import type { CallerDirectory, StaffCaller, VehicleDirectory } from './ports/directories.js';
import type { TemplateRepository } from './ports/template-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** An unknown id, or a list of a company the caller cannot see: the same answer, so ids cannot be probed. */
export type TemplateNotFound = TaggedError<'TemplateNotFound'>;
export type VehicleNotInCompany = TaggedError<'VehicleNotInCompany'>;

export interface TemplateDeps {
  readonly templates: TemplateRepository;
  readonly vehicles: VehicleDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type { CallerDirectory };

/** Anyone at the company sees its lists (a driver's check will use them); WagonWise staff see any company's. */
function canView(caller: StaffCaller, companyId: CompanyId): boolean {
  return caller.kind === 'platform' || caller.companyId === companyId;
}

/** Building the lists is a fleet job (`manage_fleet`); WagonWise staff can for any company. */
function canBuild(caller: StaffCaller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId && caller.privileges.includes('manage_fleet'))
  );
}

export async function listTemplates(
  deps: Pick<TemplateDeps, 'templates'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<CheckTemplate[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.templates.listForCompany(companyId));
}

/** An example list to start from, with new question ids. Not stored until the firm saves it. */
export function starterTemplate(deps: Pick<TemplateDeps, 'ids'>): {
  name: string;
  items: CheckItem[];
} {
  return { name: STARTER_NAME, items: starterItems(() => deps.ids.newId()) };
}

/** Every vehicle named must be the company's own. */
async function vehiclesAreTheirs(
  deps: Pick<TemplateDeps, 'vehicles'>,
  companyId: CompanyId,
  input: TemplateInput,
): Promise<boolean> {
  for (const vehicleId of input.vehicleIds) {
    if (!(await deps.vehicles.belongsToCompany(vehicleId, companyId))) return false;
  }
  return true;
}

export async function createTemplate(
  deps: TemplateDeps,
  caller: StaffCaller,
  input: TemplateInput & { readonly id: CheckTemplateId; readonly companyId: CompanyId },
): Promise<Result<CheckTemplate, Forbidden | InvalidTemplate | VehicleNotInCompany>> {
  if (!canBuild(caller, input.companyId)) return err({ tag: 'Forbidden' });
  const valid = validateTemplate(input);
  if (!valid.ok) return valid;
  if (!(await vehiclesAreTheirs(deps, input.companyId, valid.value))) {
    return err({ tag: 'VehicleNotInCompany' });
  }
  // A retry after a dropped connection sends the same id: it returns the list already made.
  const existing = await deps.templates.findById(input.id);
  if (existing !== null && existing.companyId === input.companyId) return ok(existing);
  if (existing !== null) return err({ tag: 'Forbidden' });

  const now = deps.clock.now();
  const template: CheckTemplate = {
    id: input.id,
    companyId: input.companyId,
    ...valid.value,
    version: 1,
    archivedAt: undefined,
    createdAt: now,
    updatedAt: now,
  };
  await deps.templates.save(template);
  return ok(template);
}

/** Changes a list, and raises its version so a check can say which wording it was answered against. */
export async function updateTemplate(
  deps: TemplateDeps,
  caller: StaffCaller,
  id: CheckTemplateId,
  input: TemplateInput,
): Promise<
  Result<CheckTemplate, Forbidden | TemplateNotFound | InvalidTemplate | VehicleNotInCompany>
> {
  const existing = await deps.templates.findById(id);
  if (
    existing === null ||
    existing.archivedAt !== undefined ||
    !canView(caller, existing.companyId)
  ) {
    return err({ tag: 'TemplateNotFound' });
  }
  if (!canBuild(caller, existing.companyId)) return err({ tag: 'Forbidden' });
  const valid = validateTemplate(input);
  if (!valid.ok) return valid;
  if (!(await vehiclesAreTheirs(deps, existing.companyId, valid.value))) {
    return err({ tag: 'VehicleNotInCompany' });
  }
  const updated: CheckTemplate = {
    ...existing,
    ...valid.value,
    version: existing.version + 1,
    updatedAt: deps.clock.now(),
  };
  await deps.templates.save(updated);
  return ok(updated);
}

/** Hides a list. It is not deleted: checks already done keep the questions they were answered against. */
export async function archiveTemplate(
  deps: Pick<TemplateDeps, 'templates' | 'clock'>,
  caller: StaffCaller,
  id: CheckTemplateId,
): Promise<Result<void, Forbidden | TemplateNotFound>> {
  const existing = await deps.templates.findById(id);
  if (
    existing === null ||
    existing.archivedAt !== undefined ||
    !canView(caller, existing.companyId)
  ) {
    return err({ tag: 'TemplateNotFound' });
  }
  if (!canBuild(caller, existing.companyId)) return err({ tag: 'Forbidden' });
  await deps.templates.save({ ...existing, archivedAt: deps.clock.now() });
  return ok(undefined);
}
