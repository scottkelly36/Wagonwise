import type { CheckTemplateDto, ChecksDueResponse } from '@wagonwise/contracts/checks';

/** due: still to do. waiting: done on this phone, not yet sent. done: the server has it. */
export type DueState = 'due' | 'waiting' | 'done';

export interface DueRow {
  readonly template: CheckTemplateDto;
  readonly state: DueState;
}

export interface DueView {
  readonly vehicle: { readonly id: string; readonly name: string } | null;
  readonly rows: readonly DueRow[];
}

/**
 * The lists for the driver's vehicle, with each one's state. A check finished while offline is still on the phone,
 * so it counts as done ("waiting") rather than asking the driver to do it again; the server's own answer wins once
 * it has the check.
 */
export function mergeDue(
  due: ChecksDueResponse,
  queued: readonly { readonly templateId: string; readonly vehicleId: string }[],
): DueView {
  const vehicle = due.vehicle;
  const rows = due.lists.map((list): DueRow => {
    if (list.doneToday) return { template: list.template, state: 'done' };
    const waiting =
      vehicle !== null &&
      queued.some((q) => q.templateId === list.template.id && q.vehicleId === vehicle.id);
    return { template: list.template, state: waiting ? 'waiting' : 'due' };
  });
  return { vehicle, rows };
}

export function dueRows(view: DueView): DueRow[] {
  return view.rows.filter((r) => r.state === 'due');
}

/** The line shown on the entry card. */
export function dueSummary(view: DueView): string | undefined {
  const due = dueRows(view);
  if (view.vehicle === null || due.length === 0) return undefined;
  const first = due[0];
  if (first === undefined) return undefined;
  return due.length === 1
    ? `${first.template.name} on ${view.vehicle.name}`
    : `${due.length} checks on ${view.vehicle.name}`;
}
