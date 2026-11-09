import type { RouteOptionDto } from '@wagonwise/contracts/routing';

import { formatRouteDistance, type DistanceUnit } from './units';

type Label = RouteOptionDto['labels'][number];

const LABEL_TEXT: Readonly<Record<Label, string>> = {
  fastest: 'Fastest',
  shortest: 'Shortest',
  gentle: 'Fewer hills',
};

/** The heading of a route card: its labels, "Fastest & Fewer hills" when one route is both. */
export function routeOptionTitle(option: RouteOptionDto): string {
  return option.labels.map((label) => LABEL_TEXT[label]).join(' & ');
}

/**
 * The strategy `planRoute` needs to make the route a driver picked. The route that is easier on hills is asked for by name (it is found
 * by a search, not by the engine's own choice); a route that is both fastest and fewest hills is the engine's own, so it is asked for the
 * ordinary way.
 */
export function strategyForOption(option: RouteOptionDto): 'fastest' | 'shortest' | 'gentle' {
  if (option.labels.includes('fastest')) return 'fastest';
  return option.labels.includes('gentle') ? 'gentle' : 'shortest';
}

/** What the hill check found, in a line a driver can weigh against the time, or undefined when hills were not checked. */
export function hillsLine(option: RouteOptionDto, distanceUnit: DistanceUnit): string | undefined {
  const hills = option.hills;
  if (hills === undefined) return undefined;
  const steep =
    hills.steepKm < 0.1
      ? 'No steep hills'
      : `${formatRouteDistance(hills.steepKm, distanceUnit)} of steep hill`;
  return `${steep} · highest point ${hills.highestPointM} m`;
}

/** Whether the hill check ran: asked for, and the server answered with figures. When it did not, the routes are as for an empty vehicle. */
export function hillsWereChecked(options: readonly RouteOptionDto[]): boolean {
  return options.some((option) => option.hills !== undefined);
}
