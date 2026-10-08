/** A calendar day as `YYYY-MM-DD`, in UK time. */
export type DayString = string;

/**
 * The UK calendar day an instant falls on: just after midnight in summer is already the new day here, though still
 * the old one in UTC. "Once per vehicle per day" counts these. (billing keeps its own copy; modules share no code.)
 */
export function ukDay(at: Date): DayString {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
