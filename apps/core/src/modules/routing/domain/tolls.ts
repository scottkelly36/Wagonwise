import type { GeoPoint } from './geo.js';

/**
 * The tolled crossings WagonWise can name and put a price on, for a lorry. Not every toll in Britain: a route can have a toll that is not
 * here (it is then shown as "a toll" with no name or price, from the engine's own flag). A crossing is added only when its operator's own
 * page gave the price for a goods vehicle, and each row keeps where it came from and the day it was read, because prices change.
 *
 * Reviewed by hand (the scope's "who keeps the data right"): open every `sourceUrl`, compare, update `checkedOn`. Nothing here is fetched live.
 */

/** How many axles, in the way the operators split lorries. Only two or fewer, and three or more, matter to the tariffs below. */
type Axles = 'two' | 'three-or-more';

interface TollTariff {
  /** Heavier than this, in tonnes gross. Left out: no lower limit. */
  readonly overT?: number;
  /** Up to and including this many tonnes gross. Left out: no upper limit. */
  readonly upToT?: number;
  /** Left out: any number of axles. */
  readonly axles?: Axles;
  /** The price for one crossing without an account or discount, in pounds, as the operator lists it. */
  readonly amountGBP: number;
  /** For a vehicle the operator's table does not place in a band: the most it might pay. The card then shows `amountGBP` to this, as a range, instead of a price. */
  readonly mightBeGBP?: number;
}

export interface TollCrossing {
  readonly id: string;
  readonly name: string;
  /** Where to look: a tolled stretch of a route within `radiusM` of any of these points is this crossing. Approximate on purpose. */
  readonly near: readonly GeoPoint[];
  readonly radiusM: number;
  /** Charged in one direction only: the direction of travel (compass degrees) and how far either side of it still counts. A route that crosses the other way is not charged. When the route's direction there cannot be told (one point), it is treated as charged. */
  readonly oneWay?: { readonly centreDeg: number; readonly withinDeg: number };
  readonly tariffs: readonly TollTariff[];
  /** What the price is, when it is not simply the price of a crossing: "the full length", "the most it can be". */
  readonly note?: string;
  /** When to pay, as a short sentence, only when the operator's page said. */
  readonly payBy?: string;
  /** Where the prices were read, and the day (YYYY-MM-DD). */
  readonly sourceUrl: string;
  readonly checkedOn: string;
}

/** The crossings, in no particular order. Prices are for a goods vehicle over 3.5 tonnes unless a tariff says otherwise. */
export const TOLL_CROSSINGS: readonly TollCrossing[] = [
  {
    id: 'dartford',
    name: 'Dartford Crossing',
    near: [{ lat: 51.4567, lon: 0.2474 }],
    radiusM: 4500,
    // Class C is two axles, class D more than two. Charged 6am to 10pm every day.
    tariffs: [
      { axles: 'two', amountGBP: 4.2 },
      { axles: 'three-or-more', amountGBP: 8.4 },
    ],
    note: 'Charged from 6am to 10pm. Free overnight.',
    payBy: 'Pay by midnight the day after you cross.',
    sourceUrl: 'https://www.gov.uk/pay-dartford-crossing-charge/charges',
    checkedOn: '2026-11-10',
  },
  {
    id: 'mersey-gateway',
    name: 'Mersey Gateway or Silver Jubilee Bridge',
    near: [
      { lat: 53.3523, lon: -2.7126 },
      { lat: 53.3459, lon: -2.7381 },
    ],
    radiusM: 3000,
    // Class 3: goods vehicles from 3.5 to 12 tonnes. Class 4: over 12 tonnes. Each crossing is charged.
    tariffs: [
      { overT: 3.5, upToT: 12, amountGBP: 7.2 },
      { overT: 12, amountGBP: 9.6 },
    ],
    payBy: 'Pay by 11:59pm the day after you cross, or register with Merseyflow.',
    sourceUrl: 'https://www.merseyflow.co.uk/faq',
    checkedOn: '2026-11-10',
  },
  {
    id: 'm6-toll',
    name: 'M6 Toll',
    near: [
      { lat: 52.6629, lon: -1.9642 },
      { lat: 52.6347, lon: -1.8067 },
    ],
    radiusM: 8000,
    // Class 4: two axles, class 5: more than two. The standard full-length (three zones) price from 7 July 2026; a shorter trip costs less.
    tariffs: [
      { overT: 3.5, axles: 'two', amountGBP: 20.2 },
      { overT: 3.5, axles: 'three-or-more', amountGBP: 20.9 },
    ],
    note: 'The full length. A shorter trip costs less, and an account is cheaper.',
    sourceUrl: 'https://www.m6toll.co.uk/pricing-tables/',
    checkedOn: '2026-11-10',
  },
  {
    id: 'humber-bridge',
    name: 'Humber Bridge',
    near: [{ lat: 53.7068, lon: -0.4501 }],
    radiusM: 3000,
    // The owner's copy of the operator's table (2026-11-11), both bands confirmed: "2 axle vehicles between 3.5 - 7 tonnes, 9-16 passenger mini bus, bus/coaches,
    // agricultural vehicles" £5.00 (£4.00 with an account), and "3 axles or more, over 7.5 tonnes" £15.00 (£12.00 with an account). The table has no band for a
    // two-axle vehicle over 7 tonnes (a 7.5 tonne rigid is the common case). The owner chose to show such a lorry the range between its two nearest bands, £5 to
    // £15, as what it might pay, since the operator does not say which applies (the third tariff below). Ask the operator if it matters.
    tariffs: [
      { overT: 3.5, upToT: 7, axles: 'two', amountGBP: 5 },
      { overT: 7.5, axles: 'three-or-more', amountGBP: 15 },
      { overT: 7, axles: 'two', amountGBP: 5, mightBeGBP: 15 },
    ],
    payBy: 'Pay by midnight the day after you cross.',
    sourceUrl: 'https://www.humberbridge.co.uk/humberbridge/toll-charges-restrictions/',
    checkedOn: '2026-11-11',
  },
  {
    id: 'tyne-tunnel',
    name: 'Tyne Tunnel',
    near: [{ lat: 54.993, lon: -1.485 }],
    radiusM: 2500,
    // The operator's own page (read 2026-11-11, from the owner's link) lists two paying classes: "Car, Van or Bus less than 3.5 tonnes" at £2.60 and "LGV, Van or Bus
    // over 3.5 tonnes" at £5.20 a single passage, with 10% off a pre-paid account. There is no class above it, and the page never says "lorry" or "HGV", so a lorry
    // is in the £5.20 class by elimination (the 2024 tolls order puts every motor vehicle other than classes 1 and 2 in its class 3). That replaced £4.80, which was
    // only the order's maximum. A tunnel toll is paid online, in the app, by phone or at a PayPoint, never in cash at the tunnel; the page gives no deadline.
    tariffs: [{ overT: 3.5, amountGBP: 5.2 }],
    note: 'One passage, each way. 10% off with a pre-paid account.',
    sourceUrl: 'https://www.tt2.co.uk/toll-information/toll-prices/',
    checkedOn: '2026-11-11',
  },
  {
    id: 'mersey-tunnels',
    name: 'Mersey Tunnels (Queensway or Kingsway)',
    // Midpoints of the two tunnels (Wikipedia); the tunnels are about 2.5 to 3 km long, so the radius reaches both portals.
    near: [
      { lat: 53.4009, lon: -3.0031 },
      { lat: 53.413, lon: -3.01 },
    ],
    radiusM: 2500,
    // The owner's copy of Merseytravel's table valid from 1 April 2026 (2026-11-12): Class 3, "medium goods/buses, 2 axles" £7.20 cash or card (£6.00 with T-FLOW), and
    // Class 4, "heavy goods/buses, 3+ axles" £9.60 cash or card (£8.00 with T-FLOW). Priced by axles, so a lorry between 7.5 and 18 tonnes gets the range. The page itself
    // gave a 403 to our fetch, and which direction is charged was not stated, so none is claimed.
    tariffs: [
      { overT: 3.5, axles: 'two', amountGBP: 7.2 },
      { overT: 3.5, axles: 'three-or-more', amountGBP: 9.6 },
    ],
    note: 'The cash or card price. About 17% less with a T-FLOW account.',
    sourceUrl: 'https://www.merseytravel.gov.uk/tunnels/tolls-fees-and-charges/',
    checkedOn: '2026-11-12',
  },
  {
    id: 'tamar-bridge',
    name: 'Tamar Bridge',
    near: [{ lat: 50.4081, lon: -4.2034 }],
    radiusM: 1500,
    // Charged only eastbound, from Saltash into Plymouth (the bridge runs west to east): the toll applies within 75 degrees of due east.
    oneWay: { centreDeg: 90, withinDeg: 75 },
    // The owner's copy of Tamar Crossings' table (2026-11-12), over 3.5 tonnes, cash or card: two axles £7.30, three axles £12.00, four or more £16.50 (half with a TamarTag).
    // We hold only whether a lorry has three or more axles, not which, so for three or more the price is the range from the three-axle to the four-axle figure.
    // The operator's goods-vehicle table was not on the page we could read, so these are from the owner.
    tariffs: [
      { overT: 3.5, axles: 'two', amountGBP: 7.3 },
      { overT: 3.5, axles: 'three-or-more', amountGBP: 12, mightBeGBP: 16.5 },
    ],
    note: 'Eastbound into Plymouth only, and free the other way. Half price with a TamarTag. Three axles cost less than four or more.',
    sourceUrl: 'https://www.tamarcrossings.org.uk/prices/tamar-bridge-tolls/',
    checkedOn: '2026-11-12',
  },
];

/** What a route is charged at one crossing, in a form for the card. */
export interface RouteCharge {
  readonly id: string;
  readonly name: string;
  /** Pounds. Both absent when the table has no price for this vehicle. The two differ when the vehicle's axles could put it in more than one class. */
  readonly lowGBP?: number | undefined;
  readonly highGBP?: number | undefined;
  readonly note?: string | undefined;
  readonly payBy?: string | undefined;
}

/** What the table needs to know about the vehicle. Only the weight is held; the axles are worked out from it. */
export interface ChargedVehicle {
  readonly grossWeightT: number;
}

/**
 * The axle counts a lorry of this gross weight could have. A rigid up to 7.5 tonnes has two; a rigid up to 18 tonnes has two (or three on a
 * smaller articulated one); anything heavier has three or more (a rigid over 18 tonnes, and every articulated lorry, has at least three). We do
 * not hold the number of axles, so between 7.5 and 18 tonnes it could be either.
 */
export function possibleAxles(grossWeightT: number): readonly Axles[] {
  if (grossWeightT <= 7.5) return ['two'];
  if (grossWeightT <= 18) return ['two', 'three-or-more'];
  return ['three-or-more'];
}

function inWeightBand(tariff: TollTariff, weightT: number): boolean {
  return (
    (tariff.overT === undefined || weightT > tariff.overT) &&
    (tariff.upToT === undefined || weightT <= tariff.upToT)
  );
}

/**
 * What a crossing charges this vehicle: the lowest and highest price over the axle counts it could have, or `undefined` when for any of those
 * the table has no tariff (so a price is never shown for a class that was not read). Equal when the weight settles it.
 */
export function priceFor(
  crossing: Pick<TollCrossing, 'tariffs'>,
  vehicle: ChargedVehicle,
): { readonly lowGBP: number; readonly highGBP: number } | undefined {
  const prices: number[] = [];
  for (const axles of possibleAxles(vehicle.grossWeightT)) {
    const tariff = crossing.tariffs.find(
      (t) => inWeightBand(t, vehicle.grossWeightT) && (t.axles === undefined || t.axles === axles),
    );
    if (tariff === undefined) return undefined;
    prices.push(tariff.amountGBP, tariff.mightBeGBP ?? tariff.amountGBP);
  }
  return { lowGBP: Math.min(...prices), highGBP: Math.max(...prices) };
}

const EARTH_RADIUS_M = 6_371_000;

function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const dLon = rad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(rad(to.lat));
  const x =
    Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) -
    Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The smallest angle between two compass bearings, 0 to 180. */
function angleBetweenDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Fewer metres apart than this and a route's first and last point at a crossing do not say which way it is going. */
const MIN_SPAN_FOR_DIRECTION_M = 100;

/** Whether a route travels a one-way crossing in the direction that is charged. Treated as charged when it cannot be told. */
function chargedDirection(crossing: TollCrossing, tollPoints: readonly GeoPoint[]): boolean {
  if (crossing.oneWay === undefined) return true;
  const here = tollPoints.filter((point) =>
    crossing.near.some((anchor) => distanceM(point, anchor) <= crossing.radiusM),
  );
  const first = here[0];
  const last = here[here.length - 1];
  if (
    first === undefined ||
    last === undefined ||
    distanceM(first, last) < MIN_SPAN_FOR_DIRECTION_M
  ) {
    return true;
  }
  return (
    angleBetweenDeg(bearingDeg(first, last), crossing.oneWay.centreDeg) <= crossing.oneWay.withinDeg
  );
}

function distanceM(a: GeoPoint, b: GeoPoint): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * The named tolls on a route, in the order it meets them, with what each charges this vehicle. `tollPoints` are points on the tolled stretches
 * as the engine reports them; a stretch near no crossing in the table gives nothing here (the card still says the route has a toll).
 */
export function chargesOnRoute(
  tollPoints: readonly GeoPoint[],
  vehicle: ChargedVehicle,
  crossings: readonly TollCrossing[] = TOLL_CROSSINGS,
): readonly RouteCharge[] {
  const found: { charge: RouteCharge; firstIndex: number }[] = [];
  for (const crossing of crossings) {
    const firstIndex = tollPoints.findIndex((point) =>
      crossing.near.some((anchor) => distanceM(point, anchor) <= crossing.radiusM),
    );
    if (firstIndex < 0) continue;
    if (!chargedDirection(crossing, tollPoints)) continue;
    const price = priceFor(crossing, vehicle);
    found.push({
      firstIndex,
      charge: {
        id: crossing.id,
        name: crossing.name,
        ...(price === undefined ? {} : { lowGBP: price.lowGBP, highGBP: price.highGBP }),
        ...(crossing.note === undefined ? {} : { note: crossing.note }),
        ...(crossing.payBy === undefined ? {} : { payBy: crossing.payBy }),
      },
    });
  }
  return found.sort((a, b) => a.firstIndex - b.firstIndex).map((f) => f.charge);
}
