import { findNearbyFuelRequestSchema } from '@wagonwise/contracts/fuel';
import type { FastifyInstance } from 'fastify';
import { findCheapestFuel, type FindCheapestFuelDeps } from '../application/find-cheapest-fuel.js';

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
        id: s.station.id,
        name: s.station.name,
        ...(s.station.brand === undefined ? {} : { brand: s.station.brand }),
        ...(s.station.addressLine === undefined ? {} : { addressLine: s.station.addressLine }),
        ...(s.station.city === undefined ? {} : { city: s.station.city }),
        ...(s.station.postcode === undefined ? {} : { postcode: s.station.postcode }),
        ...(s.station.phone === undefined ? {} : { phone: s.station.phone }),
        location: s.station.position,
        isMotorway: s.station.isMotorway,
        isSupermarket: s.station.isSupermarket,
        amenities: s.station.amenities,
        pencePerLitre: s.pencePerLitre,
        priceUpdatedAt: s.updatedAt.toISOString(),
        distanceM: Math.round(s.distanceM),
      })),
      ...(found.refreshedAt === undefined ? {} : { refreshedAt: found.refreshedAt.toISOString() }),
    });
  });
}
