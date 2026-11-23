/** Where the one-time note on the Overview remembers it was put away. Only a convenience on this computer: the answer itself is on the server. */
export const NOTE_DISMISSED_KEY = 'wagonwise-dashboard.researchNoteDismissed';

/** Whether the one-time note is shown: the option is on, the person has not answered the current wording, and has not put the note away. */
export function showResearchNote(
  state: { available: boolean; agreed: boolean | null } | undefined,
  dismissed: boolean,
): boolean {
  return state !== undefined && state.available && state.agreed === null && !dismissed;
}

/** "Yes, since 23 November 2026", "No", or nothing when they have not answered. */
export function researchAnswerText(agreed: boolean | null, at: string | null): string | undefined {
  if (agreed === null) return undefined;
  const day =
    at === null
      ? ''
      : new Date(at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Europe/London',
        });
  return agreed
    ? `You said yes${day === '' ? '' : ` on ${day}`}.`
    : `You said no${day === '' ? '' : ` on ${day}`}.`;
}
