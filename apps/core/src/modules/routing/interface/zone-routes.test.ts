import { lowEmissionZonesResponseSchema } from '@wagonwise/contracts/routing';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerZoneRoutes } from './zone-routes.js';

function buildApp() {
  const app = Fastify();
  // The host's staff-auth hook sets `request.staffId`; a header stands in for it here.
  app.addHook('onRequest', (request, _reply, done) => {
    const staff = request.headers['x-staff'];
    if (typeof staff === 'string') request.staffId = staff;
    done();
  });
  registerZoneRoutes(app);
  return app;
}

describe('GET /staff/routing/low-emission-zones', () => {
  it('needs a signed-in staff account', async () => {
    const response = await buildApp().inject({
      method: 'GET',
      url: '/staff/routing/low-emission-zones',
    });
    expect(response.statusCode).toBe(401);
  });

  it('gives the twelve zones with their outlines and the credit, in the shape the dashboard reads', async () => {
    const response = await buildApp().inject({
      method: 'GET',
      url: '/staff/routing/low-emission-zones',
      headers: { 'x-staff': 'staff-1' },
    });
    expect(response.statusCode).toBe(200);
    const body = lowEmissionZonesResponseSchema.parse(response.json());
    expect(body.zones).toHaveLength(12);
    expect(body.zones.map((zone) => zone.id)).toEqual(
      expect.arrayContaining(['glasgow', 'tyneside', 'london', 'bristol']),
    );
    expect(body.attribution).toMatch(/Open Government Licence v3\.0/);
    for (const zone of body.zones) {
      expect(zone.rings.length).toBeGreaterThan(0);
      expect(zone.rings.every((ring) => ring.length >= 3)).toBe(true);
    }
    // Scotland has a penalty notice, England a daily charge.
    const byId = Object.fromEntries(body.zones.map((zone) => [zone.id, zone]));
    expect(byId['glasgow']).toMatchObject({ kind: 'penalty', penaltyGBP: 60 });
    expect(byId['bristol']).toMatchObject({
      kind: 'daily',
      dailyChargeGBP: { lowGBP: 100, highGBP: 100 },
    });
    expect(byId['london']).toMatchObject({ dailyChargeGBP: { lowGBP: 100, highGBP: 300 } });
  });
});
