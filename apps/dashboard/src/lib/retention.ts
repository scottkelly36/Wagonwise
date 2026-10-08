/** The choices offered for how long delivery photos are kept, in months. Any whole number from 1 to 120 is
 *  accepted by core; these are the ones worth offering. */
export const PHOTO_RETENTION_CHOICES = [
  { months: 3, label: '3 months' },
  { months: 6, label: '6 months' },
  { months: 12, label: '12 months (recommended)' },
  { months: 24, label: '2 years' },
  { months: 60, label: '5 years' },
  { months: 72, label: '6 years' },
] as const;

/** The choices, plus the current value when it is not one of them (set by WagonWise), so the box never shows
 *  something that is not what is in force. */
export function retentionChoices(current: number | undefined): { months: number; label: string }[] {
  const choices: { months: number; label: string }[] = PHOTO_RETENTION_CHOICES.map((c) => ({
    ...c,
  }));
  if (current !== undefined && !choices.some((c) => c.months === current)) {
    choices.push({ months: current, label: `${current} months` });
    choices.sort((a, b) => a.months - b.months);
  }
  return choices;
}
