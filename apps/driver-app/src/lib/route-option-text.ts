import type { RouteOptionDto } from '@wagonwise/contracts/routing';

import { formatRouteDistance, type DistanceUnit } from './units';

type Label = RouteOptionDto['labels'][number];

const LABEL_TEXT: Readonly<Record<Label, string>> = {
  fastest: 'Fastest',
  shortest: 'Shortest',
  gentle: 'Fewer hills',
  'toll-free': 'Toll free',
};

/** The heading of a route card: its labels, "Fastest & Fewer hills" when one route is both. */
export function routeOptionTitle(option: RouteOptionDto): string {
  return option.labels.map((label) => LABEL_TEXT[label]).join(' & ');
}

/**
 * The strategy `planRoute` needs to make the route a driver picked. The route that is easier on hills is asked for by name (it is found
 * by a search, not by the engine's own choice); a route that is both fastest and fewest hills is the engine's own, so it is asked for the
 * ordinary way. The route that avoids tolls is also found by a search, so it is asked for by name; a route that is both the shortest and toll
 * free is the engine's own shortest.
 */
export function strategyForOption(
  option: RouteOptionDto,
): 'fastest' | 'shortest' | 'gentle' | 'toll-free' {
  if (option.labels.includes('fastest')) return 'fastest';
  if (option.labels.includes('gentle')) return 'gentle';
  return option.labels.includes('shortest') ? 'shortest' : 'toll-free';
}

/** Said on a card whose route has a toll, so a driver sees it before choosing. Undefined when the route has none, or the server did not say. */
export function tollLine(option: RouteOptionDto): string | undefined {
  return option.hasToll === true ? 'Includes a toll' : undefined;
}

const pounds = (amount: number): string => `£${amount.toFixed(2)}`;

export interface TollLine {
  /** "Toll: Dartford Crossing, £8.40". */
  readonly text: string;
  /** What the price is and when to pay, when the server said. */
  readonly detail?: string;
}

/**
 * The tolls on a card, one line each, with the price the server worked out for this vehicle: a single figure when its weight settles the class, "£4.20 to
 * £8.40" when its axles could put it in either, and "price not known for your vehicle" when the table has no price for it. A route with a toll the server
 * could not name gets the plain "Includes a toll". Empty when there is no toll, or the server did not say.
 */
export function tollLines(option: RouteOptionDto): readonly TollLine[] {
  const charges = option.charges ?? [];
  if (charges.length === 0) {
    const plain = tollLine(option);
    return plain === undefined ? [] : [{ text: plain }];
  }
  return charges.map((charge) => {
    const { lowGBP, highGBP } = charge;
    const price =
      lowGBP === undefined || highGBP === undefined
        ? 'price not known for your vehicle'
        : lowGBP === highGBP
          ? pounds(lowGBP)
          : `${pounds(lowGBP)} to ${pounds(highGBP)}`;
    const detail = [charge.note, charge.payBy].filter((s) => s !== undefined).join(' ');
    return { text: `Toll: ${charge.name}, ${price}`, ...(detail === '' ? {} : { detail }) };
  });
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
