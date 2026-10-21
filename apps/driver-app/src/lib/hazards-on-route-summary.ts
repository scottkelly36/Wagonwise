/** What the hazards button on the trip screen says to a screen reader: how many are on the route and what a tap does. */
export function hazardsToggleLabel(count: number, open: boolean): string {
  const what =
    count === 0
      ? 'No hazards reported on this route'
      : count === 1
        ? '1 hazard on this route'
        : `${count} hazards on this route`;
  return `${what}. ${open ? 'Hide' : 'Show'} the list.`;
}
