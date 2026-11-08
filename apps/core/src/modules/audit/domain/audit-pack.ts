import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type CheckResult = 'clear' | 'advisory' | 'do_not_drive';
export type Severity = 'advisory' | 'do_not_drive';
export type DefectStatus = 'open' | 'acknowledged' | 'fixed';
export type RepairStatus = 'open' | 'done' | 'cancelled';
export type ItemState = 'overdue' | 'due_soon' | 'ok';
export type EventKind =
  | 'check'
  | 'defect_found'
  | 'defect_changed'
  | 'repair_booked'
  | 'repair_finished'
  | 'maintenance_done'
  | 'due_date_changed';

export type InvalidRange = TaggedError<'InvalidRange'>;

/** What the reader finds for one vehicle. Ids of people stay ids until the names are looked up. */
export interface RawCheck {
  readonly id: string;
  readonly templateName: string;
  readonly templateVersion: number;
  readonly driverId: string;
  /** The UK day the check is for, `YYYY-MM-DD`. */
  readonly checkDay: string;
  readonly submittedAt: Date;
  readonly result: CheckResult;
  readonly defectCount: number;
}

export interface RawDefect {
  readonly id: string;
  readonly checkId: string;
  /** The driver who filed the check the defect came from. */
  readonly foundByDriverId: string;
  readonly label: string;
  readonly severity: Severity;
  readonly detail: string;
  readonly note: string | undefined;
  readonly status: DefectStatus;
  readonly createdAt: Date;
  readonly statusChangedAt: Date | undefined;
  readonly statusChangedBy: string | undefined;
}

export interface RawRepair {
  readonly defectId: string;
  readonly title: string;
  readonly dueDate: string;
  readonly status: RepairStatus;
  readonly note: string | undefined;
  readonly doneOn: string | undefined;
  readonly createdAt: Date;
  readonly createdBy: string | undefined;
  readonly completedAt: Date | undefined;
  readonly completedBy: string | undefined;
}

export interface RawItem {
  readonly name: string;
  readonly warnDays: number;
  readonly dueDate: string;
  readonly lastDone: string | undefined;
}

export interface RawDone {
  readonly itemName: string;
  readonly doneOn: string;
  readonly nextDue: string;
  readonly note: string | undefined;
  readonly doneBy: string | undefined;
  readonly recordedAt: Date;
}

/** One change of a defect's status, with who made it. A defect handled before the history was kept has at most one. */
export interface RawDefectEvent {
  readonly defectId: string;
  readonly status: DefectStatus;
  readonly at: Date;
  readonly by: string | undefined;
}

/** One time a due date was entered or corrected by hand. */
export interface RawDueChange {
  readonly itemName: string;
  /** `undefined` the first time a date was entered. */
  readonly fromDue: string | undefined;
  readonly toDue: string;
  readonly changedAt: Date;
  readonly changedBy: string | undefined;
}

export interface RawAuditData {
  readonly checks: readonly RawCheck[];
  readonly defects: readonly RawDefect[];
  readonly defectEvents: readonly RawDefectEvent[];
  readonly repairs: readonly RawRepair[];
  readonly items: readonly RawItem[];
  readonly done: readonly RawDone[];
  readonly dueChanges: readonly RawDueChange[];
}

/** How a person's id is shown: a driver by name (or the sign-in the office already sees), staff by their name. */
export interface Names {
  driver(id: string): string;
  staff(id: string | undefined): string | undefined;
}

export interface AuditEvent {
  readonly at: Date;
  readonly kind: EventKind;
  readonly title: string;
  readonly detail: string | undefined;
  readonly who: string | undefined;
}

export interface AuditPack {
  readonly range: { readonly from: string; readonly to: string };
  readonly generatedAt: Date;
  readonly summary: {
    readonly checks: number;
    readonly clear: number;
    readonly advisory: number;
    readonly doNotDrive: number;
    readonly defectsFound: number;
    readonly defectsNotFixed: number;
    readonly maintenanceDone: number;
    readonly maintenanceOverdue: number;
    readonly dueDatesChanged: number;
  };
  readonly checks: readonly {
    readonly id: string;
    readonly submittedAt: Date;
    readonly day: string;
    readonly list: string;
    readonly listVersion: number;
    readonly who: string;
    readonly result: CheckResult;
    readonly defects: number;
  }[];
  readonly defects: readonly {
    readonly id: string;
    readonly foundAt: Date;
    readonly foundBy: string;
    readonly item: string;
    readonly severity: Severity;
    readonly detail: string;
    readonly note: string | undefined;
    readonly status: DefectStatus;
    readonly lastChangeAt: Date | undefined;
    readonly lastChangeBy: string | undefined;
    /** Every change of status, oldest first. */
    readonly history: readonly {
      readonly status: DefectStatus;
      readonly at: Date;
      readonly by: string | undefined;
    }[];
    readonly repair:
      | {
          readonly title: string;
          readonly dueDate: string;
          readonly status: RepairStatus;
          readonly doneOn: string | undefined;
          readonly note: string | undefined;
          readonly bookedBy: string | undefined;
          readonly finishedBy: string | undefined;
        }
      | undefined;
  }[];
  readonly maintenance: {
    readonly items: readonly {
      readonly name: string;
      readonly dueDate: string;
      readonly lastDone: string | undefined;
      readonly state: ItemState;
    }[];
    readonly done: readonly {
      readonly item: string;
      readonly doneOn: string;
      readonly nextDue: string;
      readonly note: string | undefined;
      readonly by: string | undefined;
      readonly recordedAt: Date;
    }[];
    /** Every time a due date was entered or corrected by hand in the period, oldest first. */
    readonly changes: readonly {
      readonly item: string;
      readonly from: string | undefined;
      readonly to: string;
      readonly at: Date;
      readonly by: string | undefined;
    }[];
  };
  readonly timeline: readonly AuditEvent[];
}

/** The longest range one pack covers: a little over two years, so a fifteen-month look back fits. */
export const MAX_RANGE_DAYS = 800;
/** With no range, the last twelve months. */
export const DEFAULT_RANGE_DAYS = 365;

/** The UK day (`YYYY-MM-DD`) an instant falls in. */
export function ukDay(at: Date): string {
  return at.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** The range asked for, or the last twelve months ending today. Refused if backwards, not a date, or too long. */
export function resolveRange(
  now: Date,
  asked: { readonly from?: string | undefined; readonly to?: string | undefined },
): Result<{ from: string; to: string }, InvalidRange> {
  const to = asked.to ?? ukDay(now);
  const from = asked.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (!DAY.test(from) || !DAY.test(to) || from > to || addDays(from, MAX_RANGE_DAYS) < to) {
    return err({ tag: 'InvalidRange' });
  }
  return ok({ from, to });
}

/** Where a due date stands today: past, inside its warning period, or comfortably ahead. */
export function itemState(item: Pick<RawItem, 'dueDate' | 'warnDays'>, today: string): ItemState {
  if (item.dueDate < today) return 'overdue';
  return addDays(item.dueDate, -item.warnDays) <= today ? 'due_soon' : 'ok';
}

const RESULT_TEXT: Record<CheckResult, string> = {
  clear: 'all clear',
  advisory: 'fix soon',
  do_not_drive: 'do not drive',
};
const SEVERITY_TEXT: Record<Severity, string> = {
  advisory: 'fix soon',
  do_not_drive: 'do not drive',
};
const STATUS_TEXT: Record<DefectStatus, string> = {
  open: 'open',
  acknowledged: 'seen by the office',
  fixed: 'fixed',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-11-03` as "3 Nov 2026", the way the portal writes a day. The month names are written out here, not taken from the
 * machine's locale data: some versions write September as "Sept" and some as "Sep", and the same report must read the same
 * wherever it is made.
 */
export function dayText(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** A date-only value placed at midday UTC so it sorts among the day's other events and stays on that day in UK time. */
const atMidday = (day: string): Date => new Date(`${day}T12:00:00.000Z`);

/**
 * The pack for one vehicle: tables for each kind of record, counts, and every record again as one timeline, oldest first.
 * Pure: the reader supplied the rows, `names` the people, and `now` the day the report is made.
 */
export function buildAuditPack(
  raw: RawAuditData,
  names: Names,
  range: { readonly from: string; readonly to: string },
  now: Date,
): AuditPack {
  const today = ukDay(now);
  const repairByDefect = new Map(raw.repairs.map((r) => [r.defectId, r]));
  const eventsByDefect = new Map<string, RawDefectEvent[]>();
  for (const e of raw.defectEvents) {
    eventsByDefect.set(e.defectId, [...(eventsByDefect.get(e.defectId) ?? []), e]);
  }

  const checks = [...raw.checks]
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
    .map((c) => ({
      id: c.id,
      submittedAt: c.submittedAt,
      day: c.checkDay,
      list: c.templateName,
      listVersion: c.templateVersion,
      who: names.driver(c.driverId),
      result: c.result,
      defects: c.defectCount,
    }));

  const defects = [...raw.defects]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((d) => {
      const repair = repairByDefect.get(d.id);
      return {
        id: d.id,
        foundAt: d.createdAt,
        foundBy: names.driver(d.foundByDriverId),
        item: d.label,
        severity: d.severity,
        detail: d.detail,
        note: d.note,
        status: d.status,
        lastChangeAt: d.statusChangedAt,
        lastChangeBy: names.staff(d.statusChangedBy),
        history: [...(eventsByDefect.get(d.id) ?? [])]
          .sort((a, b) => a.at.getTime() - b.at.getTime())
          .map((e) => ({ status: e.status, at: e.at, by: names.staff(e.by) })),
        repair:
          repair === undefined
            ? undefined
            : {
                title: repair.title,
                dueDate: repair.dueDate,
                status: repair.status,
                doneOn: repair.doneOn,
                note: repair.note,
                bookedBy: names.staff(repair.createdBy),
                finishedBy: names.staff(repair.completedBy),
              },
      };
    });

  const items = [...raw.items]
    .map((i) => ({
      name: i.name,
      dueDate: i.dueDate,
      lastDone: i.lastDone,
      state: itemState(i, today),
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));

  const done = [...raw.done]
    .sort(
      (a, b) => a.doneOn.localeCompare(b.doneOn) || a.recordedAt.getTime() - b.recordedAt.getTime(),
    )
    .map((d) => ({
      item: d.itemName,
      doneOn: d.doneOn,
      nextDue: d.nextDue,
      note: d.note,
      by: names.staff(d.doneBy),
      recordedAt: d.recordedAt,
    }));

  const changes = [...raw.dueChanges]
    .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())
    .map((c) => ({
      item: c.itemName,
      from: c.fromDue,
      to: c.toDue,
      at: c.changedAt,
      by: names.staff(c.changedBy),
    }));

  const events: AuditEvent[] = [];
  for (const c of checks) {
    events.push({
      at: c.submittedAt,
      kind: 'check',
      title: `Walk-round check, ${c.list}: ${RESULT_TEXT[c.result]}`,
      detail: c.defects === 0 ? undefined : plural(c.defects, 'defect found', 'defects found'),
      who: c.who,
    });
  }
  for (const d of defects) {
    events.push({
      at: d.foundAt,
      kind: 'defect_found',
      title: `Defect found: ${d.item} (${SEVERITY_TEXT[d.severity]})`,
      detail:
        [d.detail, d.note].filter((t): t is string => t !== undefined && t !== '').join(' · ') ||
        undefined,
      who: d.foundBy,
    });
    if (d.history.length > 0) {
      // Every step, as it was made.
      for (const step of d.history) {
        events.push({
          at: step.at,
          kind: 'defect_changed',
          title: `Defect marked ${STATUS_TEXT[step.status]}: ${d.item}`,
          detail: undefined,
          who: step.by,
        });
      }
    } else if (d.lastChangeAt !== undefined) {
      // Nothing in the history (a change from before it was kept that is not in it): the latest change is all there is.
      events.push({
        at: d.lastChangeAt,
        kind: 'defect_changed',
        title: `Defect marked ${STATUS_TEXT[d.status]}: ${d.item}`,
        detail: undefined,
        who: d.lastChangeBy,
      });
    }
  }
  for (const r of raw.repairs) {
    const defect = raw.defects.find((d) => d.id === r.defectId);
    if (defect === undefined) continue;
    events.push({
      at: r.createdAt,
      kind: 'repair_booked',
      title: `Repair booked: ${r.title}`,
      detail: `Due ${dayText(r.dueDate)}`,
      who: names.staff(r.createdBy),
    });
    if (r.status !== 'open') {
      events.push({
        at: r.completedAt ?? (r.doneOn === undefined ? r.createdAt : atMidday(r.doneOn)),
        kind: 'repair_finished',
        title: `Repair ${r.status === 'done' ? 'done' : 'cancelled'}: ${r.title}`,
        detail:
          [r.doneOn === undefined ? undefined : `Done on ${dayText(r.doneOn)}`, r.note]
            .filter((t): t is string => t !== undefined && t !== '')
            .join(' · ') || undefined,
        who: names.staff(r.completedBy),
      });
    }
  }
  for (const d of done) {
    events.push({
      at: atMidday(d.doneOn),
      kind: 'maintenance_done',
      title: `${d.item} done on ${dayText(d.doneOn)}`,
      detail: [`Next due ${dayText(d.nextDue)}`, d.note]
        .filter((t): t is string => t !== undefined && t !== '')
        .join(' · '),
      who: d.by,
    });
  }
  for (const c of changes) {
    events.push({
      at: c.at,
      kind: 'due_date_changed',
      title:
        c.from === undefined
          ? `${c.item} due date set to ${dayText(c.to)}`
          : `${c.item} due date changed from ${dayText(c.from)} to ${dayText(c.to)}`,
      detail: undefined,
      who: c.by,
    });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    range,
    generatedAt: now,
    summary: {
      checks: checks.length,
      clear: checks.filter((c) => c.result === 'clear').length,
      advisory: checks.filter((c) => c.result === 'advisory').length,
      doNotDrive: checks.filter((c) => c.result === 'do_not_drive').length,
      // Older defects still not fixed are listed too, but they were not found in this period.
      defectsFound: defects.filter((d) => {
        const day = ukDay(d.foundAt);
        return day >= range.from && day <= range.to;
      }).length,
      defectsNotFixed: defects.filter((d) => d.status !== 'fixed').length,
      maintenanceDone: done.length,
      maintenanceOverdue: items.filter((i) => i.state === 'overdue').length,
      dueDatesChanged: changes.length,
    },
    checks,
    defects,
    maintenance: { items, done, changes },
    timeline: events,
  };
}
