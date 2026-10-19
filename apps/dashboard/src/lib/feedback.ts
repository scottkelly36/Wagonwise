import type { StaffFeedbackNoteDto } from '@wagonwise/contracts/feedback';

/** The phone and app a note came from in one line: "android 14 · app 1.2.1". */
export const sentFrom = (note: Pick<StaffFeedbackNoteDto, 'appVersion' | 'deviceInfo'>): string =>
  `${note.deviceInfo} · app ${note.appVersion}`;

/** The words a search of the notes matches against. */
export const feedbackSearchText = (note: StaffFeedbackNoteDto): string =>
  `${note.message} ${note.from ?? ''} ${note.deviceInfo}`;

export const isResolved = (note: Pick<StaffFeedbackNoteDto, 'resolvedAt'>): boolean =>
  note.resolvedAt !== undefined;
