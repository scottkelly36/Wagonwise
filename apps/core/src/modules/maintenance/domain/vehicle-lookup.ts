import type { DayString, ItemType, ItemTypeId, VehicleId } from './maintenance.js';
import { appliesToVehicle } from './maintenance.js';

export type SuggestionKind = 'mot' | 'tax';

/** A date the vehicle record offers for one of the firm's own items. The firm decides whether to take it. */
export interface DateSuggestion {
  readonly itemId: ItemTypeId;
  readonly itemName: string;
  readonly kind: SuggestionKind;
  readonly dueDate: DayString;
}

// The firm names its own items, so the match is on the name: "MOT", "Annual test", "Road tax", "Vehicle excise duty"...
// "Tax" alone is enough, but not "tachograph" or "taxi".
const MOT_NAME = /\b(mot|annual test)\b/i;
const TAX_NAME = /\b(road tax|tax|vehicle excise( duty)?|ved)\b/i;

/** Which date from the record an item of this name tracks, if any. */
export function kindOfItem(name: string): SuggestionKind | undefined {
  if (MOT_NAME.test(name)) return 'mot';
  if (TAX_NAME.test(name)) return 'tax';
  return undefined;
}

/**
 * The dates the record gave, matched to the firm's items that apply to this vehicle. An item already due on that day is
 * left out: there is nothing to change.
 */
export function suggestDates(
  items: readonly ItemType[],
  vehicleId: VehicleId,
  dates: { readonly motExpiry?: DayString | undefined; readonly taxDue?: DayString | undefined },
  currentDue: (itemId: ItemTypeId) => DayString | undefined,
): DateSuggestion[] {
  const suggestions: DateSuggestion[] = [];
  for (const item of items) {
    if (item.archivedAt !== undefined || !appliesToVehicle(item, vehicleId)) continue;
    const kind = kindOfItem(item.name);
    if (kind === undefined) continue;
    const dueDate = kind === 'mot' ? dates.motExpiry : dates.taxDue;
    if (dueDate === undefined || currentDue(item.id) === dueDate) continue;
    suggestions.push({ itemId: item.id, itemName: item.name, kind, dueDate });
  }
  return suggestions;
}
