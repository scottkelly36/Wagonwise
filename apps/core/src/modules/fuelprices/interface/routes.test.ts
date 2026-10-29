import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { InMemoryFuelRepository } from '../application/testing/in-memory-fuel-repository.js';
import { registerFuelRoutes } from './routes.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');

function buildApp() {
  const repo = new InMemoryFuelRepository();
  repo.refreshedAt = new Date('2026-10-27T11:00:00.000Z');
  repo.snapshot = {
    stations: [
      {
        id: 'a',
        name: 'Tesco Hexham',
        brand: 'TESCO',
        addressLine: 'Station Road',
        city: 'Hexham',
        postcode: 'NE46 1AA',
        phone: undefined,
        position: { lat: 54.97, lon: -2.1 },
        isMotorway: false,
        isSupermarket: true,
        closed: false,
        amenities: ['customer_toilets'],
      },
      {
        id: 'b',
        name: 'Quick Stop',
        brand: undefined,
        addressLine: undefined,
        city: undefined,
        postcode: undefined,
        phone: undefined,
        position: { lat: 54.97, lon: -2.1 },
        isMotorway: false,
        isSupermarket: false,
        closed: false,
        amenities: [],
      },
    ],
    prices: [
      {
        stationId: 'a',
        fuelType: 'B7_STANDARD',
        pencePerLitre: 189.9,
        updatedAt: new Date('2026-10-27T08:00:00.000Z'),
      },
      {
        stationId: 'b',
        fuelType: 'B7_STANDARD',
        pencePerLitre: 195,
        updatedAt: new Date('2026-10-20T08:00:00.000Z'),
      },
    ],
  };
  const app = Fastify();
  registerFuelRoutes(app, { repo, clock: { now: () => NOW } });
  return app;
}

const centre = { lat: 54.97, lon: -2.1 };

describe('POST /fuel/nearby', () => {
  it('returns diesel by default, cheapest first, with each price age and only the details a station has', async () => {
    const response = await buildApp().inject({
      method: 'POST',
      url: '/fuel/nearby',
      payload: { centre, radiusM: 10_000 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      fuelType: 'B7_STANDARD',
      refreshedAt: '2026-10-27T11:00:00.000Z',
      stations: [
        {
          id: 'a',
          name: 'Tesco Hexham',
          brand: 'TESCO',
          addressLine: 'Station Road',
          city: 'Hexham',
          postcode: 'NE46 1AA',
          location: centre,
          isMotorway: false,
          isSupermarket: true,
          amenities: ['customer_toilets'],
          pencePerLitre: 189.9,
          priceUpdatedAt: '2026-10-27T08:00:00.000Z',
          distanceM: 0,
        },
        {
          id: 'b',
          name: 'Quick Stop',
          location: centre,
          isMotorway: false,
          isSupermarket: false,
          amenities: [],
          pencePerLitre: 195,
          priceUpdatedAt: '2026-10-20T08:00:00.000Z',
          distanceM: 0,
        },
      ],
    });
  });

  it('drops prices older than maxAgeDays', async () => {
    const response = await buildApp().inject({
      method: 'POST',
      url: '/fuel/nearby',
      payload: { centre, radiusM: 10_000, maxAgeDays: 3 },
    });
    const body = response.json<{ stations: { id: string }[] }>();
    expect(body.stations.map((s) => s.id)).toEqual(['a']);
  });

  it('400s a missing centre, a radius that is too big, an unknown fuel, and a silly limit', async () => {
    const app = buildApp();
    for (const payload of [
      {},
      { centre, radiusM: 500_000 },
      { centre, radiusM: 10_000, fuelType: 'LEADED' },
      { centre, radiusM: 10_000, limit: 500 },
      { centre, radiusM: 10_000, maxAgeDays: 0 },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/fuel/nearby', payload });
      expect(response.statusCode).toBe(400);
    }
  });
});
