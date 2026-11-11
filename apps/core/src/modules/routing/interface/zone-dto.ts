import type { RouteZone, ZoneCharge } from '../domain/zones.js';

/** A zone's charge in the shape the wire carries: a penalty zone has `penaltyGBP`, a daily one has `dailyChargeGBP`. */
export function chargeToDto(charge: ZoneCharge) {
  return charge.kind === 'penalty'
    ? ({ kind: 'penalty', penaltyGBP: charge.firstGBP } as const)
    : ({
        kind: 'daily',
        dailyChargeGBP: { lowGBP: charge.lowGBP, highGBP: charge.highGBP },
      } as const);
}

/** A zone on a route in the shape the app reads (the name, whether it is charged or may be, and what the charge is). */
export function routeZoneToDto(zone: RouteZone) {
  return { name: zone.name, status: zone.status, ...chargeToDto(zone.charge) };
}
