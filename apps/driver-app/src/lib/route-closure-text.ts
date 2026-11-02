import { dayTimeText } from './closure-details';
import type { ClosureOnRoute } from './closures-on-route';
import { formatTime } from './format-date';

/** The road's name for a sentence: "M56", or "The road" when the feed gives none. */
const roadName = (item: ClosureOnRoute): string => item.closure.road ?? 'The road';

/** How many closures the route screen lists before "and N more": the panel is not scrollable, so the list has to stay short. */
export const MAX_LISTED_CLOSURES = 2;

/** What is shut, as a headline for the route screen: "M56 is closed on your route". */
export function routeClosureHeadline(item: ClosureOnRoute): string {
  const { closure } = item;
  if (closure.kind === 'lane') {
    const lanes =
      closure.lanesClosed === 1
        ? 'a lane is'
        : closure.lanesClosed > 1
          ? `${closure.lanesClosed} lanes are`
          : 'lanes are';
    return `${roadName(item)}: ${lanes} closed on your route`;
  }
  return `${roadName(item)} ${item.mayBeOpen ? 'may be' : 'is'} closed on your route`;
}

/**
 * When, against when the driver gets there: "Closed until Sun 2 Nov, 06:00 · you reach it about 23:10". Before it starts: "Closes Sun
 * 1 Nov, 22:00 · you reach it about 21:40". A long window is not necessarily shut all of it, so it says "at times".
 */
export function routeClosureDetail(item: ClosureOnRoute): string {
  const { closure, arrivesAt } = item;
  const startsMs = new Date(closure.startsAt).getTime();
  const reach = `you reach it about ${formatTime(arrivesAt)}`;
  if (arrivesAt.getTime() < startsMs) return `Closes ${dayTimeText(closure.startsAt)} · ${reach}`;
  const closed = item.mayBeOpen ? 'Closed at times until' : 'Closed until';
  return `${closed} ${dayTimeText(closure.endsAt)} · ${reach}`;
}

/** Whether to warn loudly: a full closure is a road the driver cannot get through; a lane closure only slows them. */
export function hasFullClosure(items: readonly ClosureOnRoute[]): boolean {
  return items.some((item) => item.closure.kind === 'full');
}
