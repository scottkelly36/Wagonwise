import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  appliesToVehicle,
  type CheckTemplate,
  type CheckTemplateId,
  type VehicleId,
} from '../domain/check-template.js';
import {
  evaluateCheck,
  photoWanted,
  type Answer,
  type Check,
  type CheckId,
  type DriverId,
  type InvalidAnswers,
} from '../domain/check.js';
import { ukDay } from '../domain/uk-day.js';
import type { CheckPhoto, CheckRepository } from './ports/check-repository.js';
import type { DriverMembership, DriverVehicle, VehicleDirectory } from './ports/directories.js';
import type { TemplateRepository } from './ports/template-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type TemplateNotFound = TaggedError<'TemplateNotFound'>;
export type VehicleNotInCompany = TaggedError<'VehicleNotInCompany'>;
/** The list is not meant for that vehicle (it covers other vehicles only). */
export type TemplateNotForVehicle = TaggedError<'TemplateNotForVehicle'>;
/** An unknown id, or another driver's check: the same answer, so ids cannot be probed. */
export type CheckNotFound = TaggedError<'CheckNotFound'>;
/** That question takes no photo (it is not a photo question, or the answer was not a defect that asks for one). */
export type NoPhotoWanted = TaggedError<'NoPhotoWanted'>;

export interface DriverCheckDeps {
  readonly templates: TemplateRepository;
  readonly checks: CheckRepository;
  readonly vehicles: VehicleDirectory;
  readonly driverVehicle: DriverVehicle;
  readonly membership: DriverMembership;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface DueList {
  readonly template: CheckTemplate;
  /** Someone has already done this list on this vehicle today. */
  readonly doneToday: boolean;
}

export interface ChecksDue {
  readonly vehicle: { readonly id: VehicleId; readonly name: string } | null;
  readonly lists: readonly DueList[];
}

/**
 * The check lists for the vehicle on the driver's current job, and which are done today. A driver with no job, or a
 * job with no vehicle yet, has nothing to check. A list counts as done when anyone has done it on that vehicle
 * today: it is the vehicle's daily walk-round, not each driver's.
 */
export async function checksDue(deps: DriverCheckDeps, driverId: DriverId): Promise<ChecksDue> {
  const vehicle = await deps.driverVehicle.currentVehicle(driverId);
  if (vehicle === null) return { vehicle: null, lists: [] };
  const today = ukDay(deps.clock.now());
  const all = await deps.templates.listForCompany(vehicle.companyId);
  const lists: DueList[] = [];
  for (const template of all.filter((t) => appliesToVehicle(t, vehicle.id))) {
    lists.push({
      template,
      doneToday: await deps.checks.doneOnDay(template.id, vehicle.id, today),
    });
  }
  return { vehicle: { id: vehicle.id, name: vehicle.name }, lists };
}

export interface SubmitCheckInput {
  readonly id: CheckId;
  readonly templateId: CheckTemplateId;
  readonly vehicleId: VehicleId;
  readonly answers: readonly Answer[];
  readonly completedAt: Date | undefined;
}

export type SubmitCheckError =
  Forbidden | TemplateNotFound | VehicleNotInCompany | TemplateNotForVehicle | InvalidAnswers;

/**
 * Files a completed check. The driver must belong to the list's company and the vehicle must be that company's.
 * The answers are checked against the list's questions, the defects worked out, and the check stored with a copy
 * of the questions as they were. Sending the same id again (a retry after a dropped connection) returns the check
 * already made and changes nothing.
 */
export async function submitCheck(
  deps: DriverCheckDeps,
  driverId: DriverId,
  input: SubmitCheckInput,
): Promise<Result<Check, SubmitCheckError>> {
  const existing = await deps.checks.findById(input.id);
  if (existing !== null) {
    return existing.driverId === driverId ? ok(existing) : err({ tag: 'Forbidden' });
  }

  const template = await deps.templates.findById(input.templateId);
  if (template === null || template.archivedAt !== undefined) {
    return err({ tag: 'TemplateNotFound' });
  }
  if (!(await deps.membership.isActiveDriverOfCompany(driverId, template.companyId))) {
    return err({ tag: 'Forbidden' });
  }
  const vehicle = await deps.vehicles.find(input.vehicleId);
  if (vehicle === null || vehicle.companyId !== template.companyId) {
    return err({ tag: 'VehicleNotInCompany' });
  }
  if (!appliesToVehicle(template, input.vehicleId)) return err({ tag: 'TemplateNotForVehicle' });

  const evaluated = evaluateCheck(template.items, input.answers);
  if (!evaluated.ok) return evaluated;

  const now = deps.clock.now();
  const check: Check = {
    id: input.id,
    companyId: template.companyId,
    templateId: template.id,
    templateVersion: template.version,
    templateName: template.name,
    vehicleId: input.vehicleId,
    vehicleName: vehicle.name,
    driverId,
    checkDay: ukDay(now),
    items: template.items,
    answers: evaluated.value.answers,
    result: evaluated.value.result,
    defects: evaluated.value.defects,
    submittedAt: now,
    deviceCompletedAt: input.completedAt,
  };
  await deps.checks.save(
    check,
    check.defects.map(() => deps.ids.newId()),
  );
  return ok(check);
}

/**
 * A photo for one question of a check the driver filed: a photo question, or a defect on a question that asks for
 * one. A retake replaces the earlier photo. Sending it twice is harmless, which is what lets the phone retry.
 */
export async function attachCheckPhoto(
  deps: Pick<DriverCheckDeps, 'checks' | 'clock'>,
  driverId: DriverId,
  checkId: CheckId,
  itemId: string,
  photo: CheckPhoto,
): Promise<Result<void, CheckNotFound | NoPhotoWanted>> {
  const check = await deps.checks.findById(checkId);
  if (check === null || check.driverId !== driverId) return err({ tag: 'CheckNotFound' });
  const item = check.items.find((i) => i.id === itemId);
  const answer = check.answers.find((a) => a.itemId === itemId);
  if (item === undefined || !photoWanted(item, answer)) return err({ tag: 'NoPhotoWanted' });
  await deps.checks.savePhoto(check, itemId, photo, deps.clock.now());
  return ok(undefined);
}
