/** A length of time a driver can read at a glance: under an hour as "45 min", an hour or more as "5 h 55 min" (or "6 h" on the
 *  hour). Rounds to the nearest minute. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
