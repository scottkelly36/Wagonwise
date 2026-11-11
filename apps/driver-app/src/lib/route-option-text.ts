import type { RouteOptionDto } from '@wagonwise/contracts/routing';

import { formatRouteDistance, type DistanceUnit } from './units';

type Label = RouteOptionDto['labels'][number];

const LABEL_TEXT: Readonly<Record<Label, string>> = {
  fastest: 'Fastest',
  shortest: 'Shortest',
  gentle: 'Fewer hills',
  'toll-free': 'Toll free',
  cheapest: 'Cheapest',
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

export interface ZoneLine {
  readonly text: string;
  /** True when the vehicle has been said not to meet the standard, so the penalty is certain rather than possible. */
  readonly charged: boolean;
}

/**
 * The low emission zones a route enters that could cost this vehicle, one line each. A vehicle that has not said whether it is Euro VI is told a penalty may apply and
 * where to say, never that it is fine; one that has said it is not Euro VI is told the penalty applies. Empty when the route enters none, and for a Euro VI vehicle (the
 * server leaves those out). Never says a charge will be waived: some vehicles are exempt and the app cannot tell.
 */
export function zoneLines(option: RouteOptionDto): readonly ZoneLine[] {
  return (option.zones ?? []).map((zone) => {
    const charged = zone.status === 'charged';
    if (zone.kind === 'daily') {
      const range = zone.dailyChargeGBP;
      const amount =
        range === undefined
          ? 'a daily charge'
          : range.lowGBP === range.highGBP
            ? `a charge of £${range.lowGBP} a day`
            : `a charge of £${range.lowGBP} to £${range.highGBP} a day`;
      return charged
        ? { text: `${zone.name}: your vehicle is not Euro VI, so ${amount} applies.`, charged }
        : {
            text: `${zone.name}: ${amount} applies to a vehicle that is not Euro VI. Say whether yours is, in its details.`,
            charged,
          };
    }
    return charged
      ? {
          text: `${zone.name}: your vehicle is not Euro VI, so a penalty of £${zone.penaltyGBP ?? 60} applies (more if repeated).`,
          charged,
        }
      : {
          text: `${zone.name}: a penalty of £${zone.penaltyGBP ?? 60} applies to a vehicle that is not Euro VI. Say whether yours is, in its details.`,
          charged,
        };
  });
}
const poundsText = (amount: number): string => `£${amount.toFixed(2)}`;

/**
 * What a route costs to drive once the tolls and zone charges are added to the fuel, for a card whose route has any. Empty when there is nothing to add (the card already
 * shows the fuel), when the vehicle has no fuel economy (a total of charges alone would be misleading), or when the server did not say. The figures are the most the
 * tables say, and when a toll on the route has no price here the line says so, since the real cost is then higher.
 */
export function costLine(option: RouteOptionDto): string | undefined {
  const cost = option.cost;
  if (cost === undefined || cost.totalGBP === undefined || cost.fuelGBP === undefined)
    return undefined;
  if (cost.chargesGBP <= 0) return undefined;
  const floor = cost.unpriced === true ? ' at least' : '';
  return `About${floor} ${poundsText(cost.totalGBP)} in all: ${poundsText(cost.fuelGBP)} fuel and ${poundsText(cost.chargesGBP)} in tolls and zone charges${cost.unpriced === true ? ', and a toll with no price' : ''}.`;
}

const minutesText = (min: number): string => {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
};

/**
 * What makes the Cheapest card cheapest, against the route a driver would otherwise take: "£19.20 less than the fastest, 20 min longer". The cheapest route of the
 * set that is also the fastest says only that. Empty for a card that is not the cheapest, and when the fastest route's cost is not known.
 */
export function cheapestLine(
  option: RouteOptionDto,
  options: readonly RouteOptionDto[],
): string | undefined {
  if (!option.labels.includes('cheapest')) return undefined;
  if (option.labels.includes('fastest')) return 'The cheapest of these routes, and the fastest.';
  const fastest = options.find((o) => o.labels.includes('fastest'));
  const mine = option.cost?.totalGBP;
  const theirs = fastest?.cost?.totalGBP;
  if (fastest === undefined || mine === undefined || theirs === undefined) {
    return 'The cheapest of these routes.';
  }
  const saving = Math.round((theirs - mine) * 100) / 100;
  const slower = Math.round(option.durationMin - fastest.durationMin);
  const time =
    slower > 0
      ? `, ${minutesText(slower)} longer`
      : slower < 0
        ? `, ${minutesText(-slower)} quicker`
        : '';
  return `${poundsText(saving)} less than the fastest${time}.`;
}

/** The credit the Open Government Licence asks for beside the zone boundaries, shown once under the cards when a route enters a zone. */
export const ZONE_CREDIT =
  'Zone boundaries: Improvement Service (Spatial Hub Scotland), the councils and the Greater London Authority. Contains public sector information licensed under the Open Government Licence v3.0. Some outlines are approximate or from 2022: check the signs.';

/** Whether any route enters a zone, so the credit is shown. */
export function zonesShown(options: readonly RouteOptionDto[]): boolean {
  return options.some((option) => (option.zones ?? []).length > 0);
}

/** Whether any route's zone charge is only possible because the vehicle has not said whether it is Euro VI, so the card can offer the place to say. */
export function euroVIUnknown(options: readonly RouteOptionDto[]): boolean {
  return options.some((option) =>
    (option.zones ?? []).some((zone) => zone.status === 'may-be-charged'),
  );
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
