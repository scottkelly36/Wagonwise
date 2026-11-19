const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "5 hours ago", "3 days ago"; "Never" when there is nothing. */
export function ago(iso: string | null, now: Date): string {
  if (iso === null) return 'Never';
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 2 * MINUTE) return 'Just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} minutes ago`;
  if (diff < 2 * HOUR) return '1 hour ago';
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hours ago`;
  if (diff < 2 * DAY) return '1 day ago';
  return `${Math.floor(diff / DAY)} days ago`;
}

/** Bar heights as whole percentages of the tallest; an all-zero series stays flat. */
export function barHeights(counts: readonly number[]): number[] {
  const max = Math.max(0, ...counts);
  return counts.map((c) => (max === 0 ? 0 : Math.round((c / max) * 100)));
}

/** "92%" of the whole, rounded; "0%" when there is no whole. */
export function percentOf(part: number, whole: number): string {
  return whole <= 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;
}

/** The days from the first one with a new driver onwards: the empty days before anyone joined say nothing. Oldest first in and out. */
export function fromFirstJoin<T extends { readonly joined: number }>(days: readonly T[]): T[] {
  const first = days.findIndex((d) => d.joined > 0);
  return first < 0 ? [] : days.slice(first);
}

/** A cohort's share at a stage: "61%", or a dash when nobody joined that day (nothing to take a share of). */
export function cohortShare(part: number, joined: number): string {
  return joined <= 0 ? '–' : percentOf(part, joined);
}

/** "110 (92%)": a count with its share of the accounts, for the funnel. */
export function withShare(part: number, whole: number): string {
  return `${part} (${percentOf(part, whole)})`;
}

/** "9 Oct" for a `YYYY-MM-DD` day. */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** How many weeks after joining the "do they come back" table shows: week 1 (the week they joined) to week 8. */
export const RETENTION_WEEKS = 8;

/**
 * One row of the "do they come back" table: for the week they joined and each week after it, the share of that week's new drivers
 * who started a trip in it. A week that has not come yet is blank. The last filled cell is this week, which is not over.
 */
export function retentionCells(
  week: { readonly joined: number; readonly startedTripInWeek: readonly number[] },
  columns = RETENTION_WEEKS,
): string[] {
  return Array.from({ length: columns }, (_, k) => {
    const n = week.startedTripInWeek[k];
    return n === undefined ? '' : cohortShare(n, week.joined);
  });
}

/** The Flows funnel's steps in plain English, keyed by event name (docs/flow-tracking-plan.md). */
export const FLOW_STEP_LABELS: Readonly<Record<string, string>> = {
  plan_opened: 'Opened planning',
  destination_chosen: 'Pressed Plan route',
  route_options_shown: 'Saw route options',
  route_option_picked: 'Picked an option',
  route_shown: 'Saw the route',
  trip_started: 'Started the trip',
};

/** The heading for each event's choices on the Flows section. */
export const FLOW_CHOICE_HEADINGS: Readonly<Record<string, string>> = {
  vehicle_chosen: 'Vehicle',
  load_chosen: 'Load',
  start_chosen: 'Starting from',
  destination_chosen: 'Destination picked by',
  route_option_picked: 'Route option',
  trip_started: 'Trip',
  trip_ended: 'How trips ended',
};

const CHOICE_LABELS: Readonly<Record<string, string>> = {
  own_sizes: 'Own sizes',
  existing: 'Already set',
  normal: 'Normal',
  hill_sensitive: 'Hill-sensitive',
  my_position: 'Where I am',
  search: 'Search',
  what3words: 'what3words',
  map: 'Map',
  saved_place: 'Saved place',
  yard: 'Yard',
  sample: 'Sample route',
  personal: 'Own trip',
  job: 'Job',
  end_button: 'End button',
  arrival_prompt: 'Arrival prompt',
  arrived_job: 'Job delivered',
  replan: 'Replanned',
  offline_queue: 'Ended offline',
  fastest: 'Fastest',
  toll_free: 'Toll free',
};

/** A choice in plain English; one not on the list (a vehicle preset's id, say) is shown as it is, with underscores as spaces. */
export function flowChoiceLabel(choice: string): string {
  return CHOICE_LABELS[choice] ?? choice.replaceAll('_', ' ');
}

/** Each event's choices as "Search 12 (60%), Map 8 (40%)", most common first, in the order of FLOW_CHOICE_HEADINGS. */
export function flowChoiceRows(
  choices: readonly { readonly event: string; readonly choice: string; readonly count: number }[],
): { event: string; label: string; value: string }[] {
  return Object.entries(FLOW_CHOICE_HEADINGS).flatMap(([event, label]) => {
    const own = choices.filter((c) => c.event === event).sort((a, b) => b.count - a.count);
    if (own.length === 0) return [];
    const total = own.reduce((sum, c) => sum + c.count, 0);
    const value = own
      .map((c) => `${flowChoiceLabel(c.choice)} ${c.count} (${percentOf(c.count, total)})`)
      .join(', ');
    return [{ event, label, value }];
  });
}

/** "45 s", "2 min 5 s" or a dash when there is nothing to take a median of. */
export function seconds(s: number | null): string {
  if (s === null) return '–';
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m} min` : `${m} min ${rest} s`;
}

/** "1.2.1 · 18 Nov" for an over-the-air update (its publish day), "1.2.1 · no date" for the store build's own code or an app too old
 *  to say: the store version alone stays the same across over-the-air releases. */
export function versionLabel(appVersion: string, updateDate: string | null | undefined): string {
  return `${appVersion} · ${updateDate === null || updateDate === undefined ? 'no date' : shortDay(updateDate)}`;
}
