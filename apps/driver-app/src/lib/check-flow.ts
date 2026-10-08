import {
  attachCheckPhotoRequestSchema,
  type AttachCheckPhotoRequest,
  type CheckAnswer,
  type CheckItem,
  type CheckResult,
  type DefectSeverity,
} from '@wagonwise/contracts/checks';

/** What the driver has entered for one question so far. */
export interface AnswerState {
  /** `ok`/`defect`, `yes`/`no`, a number, or the text of a note. A photo question has no value, only a photo. */
  readonly value?: string | number | undefined;
  /** What the driver says about a defect. */
  readonly note?: string | undefined;
  readonly photo?: AttachCheckPhotoRequest | undefined;
}

export type Answers = Readonly<Record<string, AnswerState>>;

/** Reads a typed number: "12", "12.5", and "12,5" (many UK phones offer a comma). `undefined` for anything else. */
export function numberFromText(text: string): number | undefined {
  const cleaned = text.trim().replace(',', '.');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

/** Whether this answer is a defect: the same rule core applies when the check is filed. */
export function isDefect(item: CheckItem, state: AnswerState | undefined): boolean {
  const value = state?.value;
  switch (item.kind) {
    case 'pass_fail':
      return value === 'defect';
    case 'yes_no':
      return value === item.defectWhen;
    case 'number':
      return (
        typeof value === 'number' &&
        ((item.min !== undefined && value < item.min) ||
          (item.max !== undefined && value > item.max))
      );
    default:
      return false;
  }
}

export function severityOf(item: CheckItem): DefectSeverity | undefined {
  return 'severity' in item ? item.severity : undefined;
}

/** A photo question always wants a photo; a defect on a question that asks for one wants one too. */
export function wantsPhoto(item: CheckItem, state: AnswerState | undefined): boolean {
  if (item.kind === 'photo') return true;
  if (item.kind === 'pass_fail' || item.kind === 'yes_no') {
    return item.photoOnDefect && isDefect(item, state);
  }
  return false;
}

export function isAnswered(item: CheckItem, state: AnswerState | undefined): boolean {
  if (state === undefined) return false;
  switch (item.kind) {
    case 'photo':
      return state.photo !== undefined;
    case 'note':
      return typeof state.value === 'string' && state.value.trim() !== '';
    case 'number':
      return typeof state.value === 'number' && Number.isFinite(state.value);
    default:
      return state.value !== undefined;
  }
}

/** The required questions still to answer, in order. */
export function missingRequired(items: readonly CheckItem[], answers: Answers): CheckItem[] {
  return items.filter((item) => item.required && !isAnswered(item, answers[item.id]));
}

export function canFinish(items: readonly CheckItem[], answers: Answers): boolean {
  return items.length > 0 && missingRequired(items, answers).length === 0;
}

/** The answers as core takes them. An optional question left alone is simply not sent. */
export function buildAnswers(items: readonly CheckItem[], answers: Answers): CheckAnswer[] {
  const built: CheckAnswer[] = [];
  for (const item of items) {
    const state = answers[item.id];
    if (!isAnswered(item, state) || state === undefined) continue;
    const note = isDefect(item, state) && state.note?.trim() ? state.note.trim() : undefined;
    const value = item.kind === 'photo' ? 'photo' : state.value;
    if (value === undefined) continue;
    built.push({ itemId: item.id, value, ...(note === undefined ? {} : { note }) });
  }
  return built;
}

/** The photos to send once the check itself is in: those the questions asked for and the driver took. */
export function photosToSend(
  items: readonly CheckItem[],
  answers: Answers,
): { itemId: string; photo: AttachCheckPhotoRequest }[] {
  const photos: { itemId: string; photo: AttachCheckPhotoRequest }[] = [];
  for (const item of items) {
    const state = answers[item.id];
    if (state?.photo !== undefined && wantsPhoto(item, state)) {
      photos.push({ itemId: item.id, photo: state.photo });
    }
  }
  return photos;
}

export interface LocalResult {
  readonly result: CheckResult;
  readonly defects: readonly { readonly label: string; readonly severity: DefectSeverity }[];
}

/** What the driver is told when they finish, worked out on the phone (so it also holds offline). Core works out
 *  the official one from the same answers. */
export function localResult(items: readonly CheckItem[], answers: Answers): LocalResult {
  const defects: { label: string; severity: DefectSeverity }[] = [];
  for (const item of items) {
    const severity = severityOf(item);
    if (severity !== undefined && isDefect(item, answers[item.id])) {
      defects.push({ label: item.label, severity });
    }
  }
  const result: CheckResult = defects.some((d) => d.severity === 'do_not_drive')
    ? 'do_not_drive'
    : defects.length > 0
      ? 'advisory'
      : 'clear';
  return { result, defects };
}

/** What the camera hands back that we read, narrowed so this stays testable without the native module. */
export interface CapturedPhoto {
  readonly base64?: string | null;
  readonly mimeType?: string | undefined;
}

/** A camera result as the request core accepts, or `undefined` if it cannot be one (too big, not an image). The
 *  contract's own schema decides, so a photo core would refuse is refused before it is queued. */
export function prepareCheckPhoto(photo: CapturedPhoto): AttachCheckPhotoRequest | undefined {
  if (photo.base64 === undefined || photo.base64 === null) return undefined;
  const parsed = attachCheckPhotoRequestSchema.safeParse({
    contentType: photo.mimeType ?? 'image/jpeg',
    dataBase64: photo.base64,
  });
  return parsed.success ? parsed.data : undefined;
}

export const RESULT_TEXT: Record<CheckResult, { title: string; body: string }> = {
  clear: { title: 'Check done', body: 'No problems found. Safe travels.' },
  advisory: {
    title: 'Check done',
    body: 'Your defects have gone to the office to be fixed. You can carry on.',
  },
  do_not_drive: {
    title: 'Do not drive this vehicle',
    body: 'You reported a defect that should be fixed before it goes out. Tell your office now.',
  },
};
