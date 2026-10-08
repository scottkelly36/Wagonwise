import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type CheckTemplateId = Id<'CheckTemplateId'>;
// checks owns its own CompanyId, StaffId and FleetVehicleId (same brand names as every module's copy, so a
// value another module makes is usable here via makeId() without importing across the boundary).
export type CompanyId = Id<'CompanyId'>;
export type StaffId = Id<'StaffId'>;
export type VehicleId = Id<'FleetVehicleId'>;

export const MAX_NAME = 80;
export const MAX_ITEMS = 60;
export const MAX_LABEL = 120;
export const MAX_HELP = 300;
export const MAX_UNIT = 20;

/** `do_not_drive`: the vehicle should not go out with this defect. `advisory`: to be fixed soon. */
export type DefectSeverity = 'advisory' | 'do_not_drive';

interface ItemBase {
  /** Stable across edits, so a driver's answer stays tied to its question. */
  readonly id: string;
  readonly label: string;
  readonly help?: string | undefined;
  readonly required: boolean;
}

export interface PassFailItem extends ItemBase {
  readonly kind: 'pass_fail';
  readonly severity: DefectSeverity;
  readonly photoOnDefect: boolean;
}
export interface YesNoItem extends ItemBase {
  readonly kind: 'yes_no';
  /** The answer that counts as a defect. */
  readonly defectWhen: 'yes' | 'no';
  readonly severity: DefectSeverity;
  readonly photoOnDefect: boolean;
}
export interface NumberItem extends ItemBase {
  readonly kind: 'number';
  readonly unit?: string | undefined;
  /** An answer outside min to max (whichever are set) counts as a defect. */
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly severity: DefectSeverity;
}
export interface NoteItem extends ItemBase {
  readonly kind: 'note';
}
export interface PhotoItem extends ItemBase {
  readonly kind: 'photo';
}
export type CheckItem = PassFailItem | YesNoItem | NumberItem | NoteItem | PhotoItem;

/**
 * A company's own walk-round check list. Each firm builds its own, so firms can ask different things, or
 * nothing at all. It applies to every vehicle the company has, or only to the vehicles named.
 * Editing it raises `version`; an archived list is hidden, but a past check keeps the questions it was
 * answered against.
 */
export interface CheckTemplate {
  readonly id: CheckTemplateId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly appliesTo: 'all' | 'selected';
  readonly vehicleIds: readonly VehicleId[];
  readonly items: readonly CheckItem[];
  readonly version: number;
  readonly archivedAt: Date | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TemplateInput {
  readonly name: string;
  readonly appliesTo: 'all' | 'selected';
  readonly vehicleIds: readonly VehicleId[];
  readonly items: readonly CheckItem[];
}

export interface InvalidTemplate extends TaggedError<'InvalidTemplate'> {
  readonly reason:
    | 'name'
    | 'no_items'
    | 'too_many_items'
    | 'duplicate_item_ids'
    | 'bad_item'
    | 'no_vehicles_selected';
  /** The question at fault, when one is. */
  readonly itemId?: string;
}

const invalid = (reason: InvalidTemplate['reason'], itemId?: string): InvalidTemplate => ({
  tag: 'InvalidTemplate',
  reason,
  ...(itemId === undefined ? {} : { itemId }),
});

/** A question is sound when it has text within the limits and, for a number, a range that makes sense. */
function itemProblem(item: CheckItem): boolean {
  const label = item.label.trim();
  if (label.length === 0 || label.length > MAX_LABEL) return true;
  if ((item.help?.trim().length ?? 0) > MAX_HELP) return true;
  if (item.kind === 'number') {
    if ((item.unit?.trim().length ?? 0) > MAX_UNIT) return true;
    const { min, max } = item;
    if (min !== undefined && !Number.isFinite(min)) return true;
    if (max !== undefined && !Number.isFinite(max)) return true;
    if (min !== undefined && max !== undefined && min > max) return true;
  }
  return false;
}

/** Trims the text, and refuses a list that could not be answered sensibly. */
export function validateTemplate(input: TemplateInput): Result<TemplateInput, InvalidTemplate> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > MAX_NAME) return err(invalid('name'));
  if (input.items.length === 0) return err(invalid('no_items'));
  if (input.items.length > MAX_ITEMS) return err(invalid('too_many_items'));
  const ids = new Set<string>();
  for (const item of input.items) {
    if (ids.has(item.id)) return err(invalid('duplicate_item_ids', item.id));
    ids.add(item.id);
    if (itemProblem(item)) return err(invalid('bad_item', item.id));
  }
  if (input.appliesTo === 'selected' && input.vehicleIds.length === 0) {
    return err(invalid('no_vehicles_selected'));
  }
  const items = input.items.map((item): CheckItem => {
    const help = item.help?.trim();
    const label = item.label.trim();
    const common = { ...item, label, help: help === '' ? undefined : help };
    return item.kind === 'number'
      ? {
          ...(common as typeof item),
          unit: item.unit?.trim() === '' ? undefined : item.unit?.trim(),
        }
      : common;
  });
  return ok({
    name,
    appliesTo: input.appliesTo,
    // A list that covers every vehicle has no need to name any.
    vehicleIds: input.appliesTo === 'all' ? [] : [...new Set(input.vehicleIds)],
    items,
  });
}

/** Whether this list is meant for the vehicle. */
export function appliesToVehicle(
  template: Pick<CheckTemplate, 'appliesTo' | 'vehicleIds'>,
  vehicleId: VehicleId,
): boolean {
  return template.appliesTo === 'all' || template.vehicleIds.includes(vehicleId);
}
