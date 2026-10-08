import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type {
  CheckItem,
  CheckTemplateId,
  CompanyId,
  DefectSeverity,
  VehicleId,
} from './check-template.js';

export type CheckId = Id<'CheckId'>;
export type DriverId = Id<'DriverId'>;

export const MAX_ANSWER_TEXT = 500;

export type CheckResult = 'clear' | 'advisory' | 'do_not_drive';

/** What the driver answered: `ok`/`defect`, `yes`/`no`, a number, some text, or `photo`. */
export interface Answer {
  readonly itemId: string;
  readonly value: string | number;
  /** What the driver says about a defect. */
  readonly note?: string | undefined;
}

/** A thing found wrong, in words the office can read without the questions beside it. */
export interface Defect {
  readonly itemId: string;
  readonly label: string;
  readonly severity: DefectSeverity;
  readonly detail: string;
  readonly note: string | undefined;
}

/** A walk-round check as done. `items` is the questions it was answered against, kept whole. */
export interface Check {
  readonly id: CheckId;
  readonly companyId: CompanyId;
  readonly templateId: CheckTemplateId;
  readonly templateVersion: number;
  readonly templateName: string;
  readonly vehicleId: VehicleId;
  readonly vehicleName: string;
  readonly driverId: DriverId;
  /** The UK day it was received, `YYYY-MM-DD`. */
  readonly checkDay: string;
  readonly items: readonly CheckItem[];
  readonly answers: readonly Answer[];
  readonly result: CheckResult;
  readonly defects: readonly Defect[];
  readonly submittedAt: Date;
  readonly deviceCompletedAt: Date | undefined;
}

export interface InvalidAnswers extends TaggedError<'InvalidAnswers'> {
  readonly reason:
    'unknown_question' | 'repeated_answer' | 'wrong_kind_of_answer' | 'missing_answer';
  readonly itemId: string;
}

const invalid = (reason: InvalidAnswers['reason'], itemId: string): InvalidAnswers => ({
  tag: 'InvalidAnswers',
  reason,
  itemId,
});

const isText = (value: string | number): value is string => typeof value === 'string';

/** A reading in plain words: "70 psi", "125000". */
const reading = (value: number, unit: string | undefined): string =>
  unit === undefined ? String(value) : `${value} ${unit}`;

/** The range a number must be in, in words: "80 to 120", "at least 80", "at most 120". */
function range(min: number | undefined, max: number | undefined, unit: string | undefined): string {
  const u = unit === undefined ? '' : ` ${unit}`;
  if (min !== undefined && max !== undefined) return `${min} to ${max}${u}`;
  if (min !== undefined) return `at least ${min}${u}`;
  return `at most ${max}${u}`;
}

/**
 * Checks the answers against the questions and works out what was found. Every answer must be to a question in the
 * list, once, of the right kind; every required question must be answered. A defect is a flagged tick, the defect
 * answer to a yes-or-no, or a number outside its range. The result is the worst defect: do not drive over fix
 * soon over clear. Text is trimmed.
 */
export function evaluateCheck(
  items: readonly CheckItem[],
  answers: readonly Answer[],
): Result<{ answers: Answer[]; defects: Defect[]; result: CheckResult }, InvalidAnswers> {
  const byItem = new Map(items.map((item) => [item.id, item]));
  const given = new Map<string, Answer>();
  for (const answer of answers) {
    if (!byItem.has(answer.itemId)) return err(invalid('unknown_question', answer.itemId));
    if (given.has(answer.itemId)) return err(invalid('repeated_answer', answer.itemId));
    given.set(answer.itemId, answer);
  }

  const kept: Answer[] = [];
  const defects: Defect[] = [];
  for (const item of items) {
    const answer = given.get(item.id);
    const text = answer !== undefined && isText(answer.value) ? answer.value.trim() : undefined;
    const answered = answer !== undefined && (text === undefined ? true : text !== '');
    if (!answered || answer === undefined) {
      // An unanswered note is the same as no note.
      if (item.required) return err(invalid('missing_answer', item.id));
      continue;
    }
    const note = answer.note?.trim() ? answer.note.trim() : undefined;
    const judged = judge(item, answer, text);
    if (judged === undefined) return err(invalid('wrong_kind_of_answer', item.id));
    const detail = judged.detail;

    kept.push({
      itemId: item.id,
      value: text ?? answer.value,
      ...(note === undefined ? {} : { note }),
    });
    if (detail !== undefined && 'severity' in item) {
      defects.push({ itemId: item.id, label: item.label, severity: item.severity, detail, note });
    }
  }

  const result: CheckResult = defects.some((d) => d.severity === 'do_not_drive')
    ? 'do_not_drive'
    : defects.length > 0
      ? 'advisory'
      : 'clear';
  return ok({ answers: kept, defects, result });
}

/** Which items want a photo: every photo question, and a defect on a question that asks for one. */
export function photoWanted(item: CheckItem, answer: Answer | undefined): boolean {
  if (item.kind === 'photo') return true;
  if (answer === undefined) return false;
  if (item.kind === 'pass_fail') return item.photoOnDefect && answer.value === 'defect';
  if (item.kind === 'yes_no') return item.photoOnDefect && answer.value === item.defectWhen;
  return false;
}

/**
 * Whether an answer fits its question, and what it says is wrong with the vehicle. `undefined` means the answer is
 * not of the right kind for the question; `{ detail: undefined }` means it is fine.
 */
function judge(
  item: CheckItem,
  answer: Answer,
  text: string | undefined,
): { readonly detail: string | undefined } | undefined {
  switch (item.kind) {
    case 'pass_fail':
      if (text !== 'ok' && text !== 'defect') return undefined;
      return { detail: text === 'defect' ? 'Flagged as a defect' : undefined };
    case 'yes_no':
      if (text !== 'yes' && text !== 'no') return undefined;
      return { detail: text === item.defectWhen ? `Answered "${text}"` : undefined };
    case 'number': {
      if (typeof answer.value !== 'number') return undefined;
      const low = item.min !== undefined && answer.value < item.min;
      const high = item.max !== undefined && answer.value > item.max;
      return {
        detail:
          low || high
            ? `Reading ${reading(answer.value, item.unit)}, should be ${range(item.min, item.max, item.unit)}`
            : undefined,
      };
    }
    case 'note':
      return text === undefined ? undefined : { detail: undefined };
    case 'photo':
      return text === 'photo' ? { detail: undefined } : undefined;
  }
}
