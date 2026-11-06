import { findNearbyFuelRequestSchema } from '@wagonwise/contracts/fuel';
import type { FastifyInstance } from 'fastify';
import { findCheapestFuel, type FindCheapestFuelDeps } from '../application/find-cheapest-fuel.js';
import type { FuelStation } from '../domain/fuel.js';

/** A station as the contract spells it: the same fields whether or not it has a price. */
function stationFields(station: FuelStation) {
  return {
    id: station.id,
    name: station.name,
    ...(station.brand === undefined ? {} : { brand: station.brand }),
    ...(station.addressLine === undefined ? {} : { addressLine: station.addressLine }),
    ...(station.city === undefined ? {} : { city: station.city }),
    ...(station.postcode === undefined ? {} : { postcode: station.postcode }),
    ...(station.phone === undefined ? {} : { phone: station.phone }),
    location: station.position,
    isMotorway: station.isMotorway,
    isSupermarket: station.isSupermarket,
    amenities: station.amenities,
  };
}

/**
 * The cheapest stations around a point for one fuel, for the driver app. POST because the point rides in the body, as for parking
 * and cameras. The host's driver-auth hook requires a verified driver behind the whole `/fuel/` prefix; nothing here is per driver.
 * Reads our own copy of Fuel Finder only: no request here ever reaches the government's service.
 */
export function registerFuelRoutes(app: FastifyInstance, deps: FindCheapestFuelDeps): void {
  app.post('/fuel/nearby', async (request, reply) => {
    const parsed = findNearbyFuelRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const { centre, radiusM, fuelType, maxAgeDays, limit } = parsed.data;
    const found = await findCheapestFuel(deps, { centre, radiusM, fuelType, maxAgeDays, limit });
    return reply.status(200).send({
      fuelType,
      stations: found.stations.map((s) => ({
        ...stationFields(s.station),
        pencePerLitre: s.pencePerLitre,
        priceUpdatedAt: s.updatedAt.toISOString(),
        distanceM: Math.round(s.distanceM),
      })),
      withoutPrice: found.withoutPrice.map((s) => ({
        ...stationFields(s.station),
        distanceM: Math.round(s.distanceM),
      })),
      ...(found.refreshedAt === undefined ? {} : { refreshedAt: found.refreshedAt.toISOString() }),
    });
  });
}
