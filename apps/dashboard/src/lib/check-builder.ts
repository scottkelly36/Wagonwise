import type { CheckItem, CheckItemKind } from '@wagonwise/contracts/checks';

/** How each kind of question is named in the builder. */
export const ITEM_KIND_LABELS: Record<CheckItemKind, string> = {
  pass_fail: 'Tick or flag a defect',
  yes_no: 'Yes or no',
  number: 'A number',
  note: 'A note',
  photo: 'A photo',
};

export const ITEM_KINDS = Object.keys(ITEM_KIND_LABELS) as CheckItemKind[];

/** A fresh question of the given kind, with sensible settings the firm can change. */
export function newItem(kind: CheckItemKind, id: string, label = ''): CheckItem {
  const base = { id, label, required: true };
  switch (kind) {
    case 'pass_fail':
      return { ...base, kind, severity: 'advisory', photoOnDefect: true };
    case 'yes_no':
      return { ...base, kind, defectWhen: 'no', severity: 'advisory', photoOnDefect: false };
    case 'number':
      return { ...base, kind, severity: 'advisory' };
    case 'note':
      return { ...base, kind, required: false };
    case 'photo':
      return { ...base, kind };
  }
}

/** Changes what kind a question is, keeping its text and whether it is required. */
export function changeKind(item: CheckItem, kind: CheckItemKind): CheckItem {
  if (item.kind === kind) return item;
  const fresh = newItem(kind, item.id, item.label);
  const help = item.help === undefined ? {} : { help: item.help };
  return { ...fresh, ...help, required: kind === 'note' ? item.required : item.required };
}

/** Moves a question up (-1) or down (+1); stays put at either end. */
export function moveItem(items: readonly CheckItem[], index: number, delta: -1 | 1): CheckItem[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as CheckItem);
  return next;
}

export interface BuilderProblem {
  readonly message: string;
}

/** What stops a list being saved yet, in plain words. Empty when it is ready. */
export function problemsWith(input: {
  name: string;
  appliesTo: 'all' | 'selected';
  vehicleIds: readonly string[];
  items: readonly CheckItem[];
}): string[] {
  const problems: string[] = [];
  if (input.name.trim() === '') problems.push('Give the list a name.');
  if (input.items.length === 0) problems.push('Add at least one question.');
  if (input.items.some((i) => i.label.trim() === ''))
    problems.push('Every question needs some text.');
  if (input.appliesTo === 'selected' && input.vehicleIds.length === 0) {
    problems.push('Choose which vehicles it is for, or make it for all.');
  }
  for (const item of input.items) {
    if (
      item.kind === 'number' &&
      item.min !== undefined &&
      item.max !== undefined &&
      item.min > item.max
    ) {
      problems.push(
        `"${item.label.trim() || 'A number question'}": the lowest is above the highest.`,
      );
    }
  }
  return problems;
}

/** A one-line summary of a list for the lists page. */
export function describeList(t: {
  items: readonly CheckItem[];
  appliesTo: 'all' | 'selected';
  vehicleIds: readonly string[];
}): string {
  const questions = `${t.items.length} question${t.items.length === 1 ? '' : 's'}`;
  const where =
    t.appliesTo === 'all'
      ? 'all vehicles'
      : `${t.vehicleIds.length} vehicle${t.vehicleIds.length === 1 ? '' : 's'}`;
  return `${questions}, for ${where}`;
}
