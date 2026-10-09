import type {
  ItemTypeDto,
  MaintenanceStatusDto,
  OverviewRowDto,
} from '@wagonwise/contracts/maintenance';

export const STATUS_LABELS: Record<MaintenanceStatusDto, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  no_date: 'No date yet',
  ok: 'Fine',
};

export const STATUS_COLOURS: Record<MaintenanceStatusDto, string> = {
  overdue: '#dc2626',
  due_soon: '#b45309',
  no_date: '#6b7280',
  ok: '#15803d',
};

/** `2026-10-09` as "9 Oct 2026". */
export function dayText(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** How far off a date is, in words: "Overdue by 8 days", "Due today", "Due in 5 days", "Due 12 Mar 2027". */
export function dueText(row: Pick<OverviewRowDto, 'dueDate' | 'daysUntil' | 'status'>): string {
  if (row.dueDate === undefined || row.daysUntil === undefined) return 'No date yet';
  if (row.daysUntil < 0) return `Overdue by ${plural(-row.daysUntil, 'day')}`;
  if (row.daysUntil === 0) return 'Due today';
  if (row.status === 'due_soon') return `Due in ${plural(row.daysUntil, 'day')}`;
  return `Due ${dayText(row.dueDate)}`;
}

/** "every 12 months", "every 6 weeks", "every week". */
export function intervalText(item: Pick<ItemTypeDto, 'intervalValue' | 'intervalUnit'>): string {
  const unit = item.intervalUnit.slice(0, -1);
  return item.intervalValue === 1
    ? `every ${unit}`
    : `every ${item.intervalValue} ${item.intervalUnit}`;
}

/** The registration, if there is one, beside the name: "Big Van (AB12CDE)". */
export function vehicleLabel(row: Pick<OverviewRowDto, 'vehicleName' | 'registration'>): string {
  return row.registration === undefined
    ? row.vehicleName
    : `${row.vehicleName} (${row.registration})`;
}
