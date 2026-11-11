import { describe, expect, it } from 'vitest';
import {
  densify,
  LOW_EMISSION_ZONES,
  zoneContains,
  zonesEntered,
  zonesForVehicle,
  type LowEmissionZone,
} from './zones.js';

const zone = (id: string): LowEmissionZone => {
  const found = LOW_EMISSION_ZONES.find((z) => z.id === id);
  if (found === undefined) throw new Error(`no zone ${id}`);
  return found;
};
const at = (lat: number, lon: number) => ({ lat, lon });

describe('the boundaries, against places whose positions are known', () => {
  // Compared by eye against OpenStreetMap streets on 2026-11-11, not against the councils' own maps: these are sanity checks that the
  // conversion from the grid landed in the right place, not a statement of where each council draws its line.
  it.each([
    ['glasgow', 'George Square', 55.8611, -4.2502],
    ['glasgow', 'Central Station', 55.8584, -4.2582],
    ['glasgow', 'Queen Street Station', 55.8624, -4.2515],
    ['edinburgh', 'Waverley Station', 55.952, -3.1896],
    ['edinburgh', 'Edinburgh Castle', 55.9486, -3.1999],
    ['edinburgh', 'St Giles', 55.9495, -3.1909],
    ['dundee', 'City Square', 56.4614, -2.9697],
    ['aberdeen', 'Castlegate', 57.1478, -2.0934],
    ['aberdeen', 'Marischal College', 57.1487, -2.0947],
  ])('has %s zone around %s', (id, _name, lat, lon) => {
    expect(zoneContains(zone(id), at(lat, lon))).toBe(true);
  });

  it.each([
    ['glasgow', 'Glasgow Airport', 55.8719, -4.4331],
    ['glasgow', 'Hampden Park', 55.8259, -4.252],
    ['glasgow', 'Celtic Park', 55.8497, -4.2057],
    ['edinburgh', 'Edinburgh Airport', 55.95, -3.3725],
    // The Dundee zone is the compact centre inside the inner ring road: the waterfront is just outside it.
    ['dundee', 'V&A Dundee', 56.4579, -2.9677],
    ['dundee', 'Dundee Airport', 56.4525, -3.0258],
    ['aberdeen', 'Aberdeen Airport', 57.2019, -2.1978],
  ])('keeps %s zone off %s', (id, _name, lat, lon) => {
    expect(zoneContains(zone(id), at(lat, lon))).toBe(false);
  });

  it('does not put a place in another city’s zone', () => {
    expect(zoneContains(zone('glasgow'), at(55.952, -3.1896))).toBe(false);
    expect(zoneContains(zone('edinburgh'), at(55.8611, -4.2502))).toBe(false);
  });
});

describe('densify', () => {
  it('adds points along a long straight stretch so none is further than the step from the next', () => {
    const line = densify([at(55.8, -4.3), at(55.8, -4.2)], 50);
    expect(line.length).toBeGreaterThan(100);
    expect(line[0]).toEqual(at(55.8, -4.3));
    expect(line[line.length - 1]).toEqual(at(55.8, -4.2));
  });

  it('leaves close points alone', () => {
    const line = [at(55.8, -4.3), at(55.8001, -4.3)];
    expect(densify(line, 50)).toEqual(line);
  });

  it('copes with nothing and with one point', () => {
    expect(densify([])).toEqual([]);
    expect(densify([at(55, -4)])).toEqual([at(55, -4)]);
  });
});

describe('zonesEntered', () => {
  it('names the zone a route goes through', () => {
    const route = [at(55.8611, -4.3), at(55.8611, -4.2502), at(55.8611, -4.2)];
    expect(zonesEntered(route).map((z) => z.id)).toEqual(['glasgow']);
  });

  it('does not miss a zone when the route has a point at each end and none inside', () => {
    // Both points are well outside Glasgow's zone, on either side of George Square, a few kilometres apart.
    const route = [at(55.8611, -4.3), at(55.8611, -4.2)];
    expect(zoneContains(zone('glasgow'), route[0]!)).toBe(false);
    expect(zoneContains(zone('glasgow'), route[1]!)).toBe(false);
    expect(zonesEntered(route).map((z) => z.id)).toEqual(['glasgow']);
  });

  it('lists zones in the order the route meets them, each once', () => {
    const route = [
      at(55.952, -3.1896), // Edinburgh
      at(55.9525, -3.19),
      at(55.8611, -4.2502), // then Glasgow
      at(55.8584, -4.2582),
    ];
    expect(zonesEntered(route).map((z) => z.id)).toEqual(['edinburgh', 'glasgow']);
  });

  it('says nothing for a route that stays out, or has no points', () => {
    expect(zonesEntered([at(54.9783, -1.6178), at(54.9, -1.5)])).toEqual([]);
    expect(zonesEntered([])).toEqual([]);
  });

  it('gives nothing when there are no zones to look at', () => {
    expect(zonesEntered([at(55.8611, -4.2502)], [])).toEqual([]);
  });
});

describe('zonesForVehicle', () => {
  const glasgow = [zone('glasgow')];

  it('charges a vehicle that has been said not to meet Euro VI', () => {
    expect(zonesForVehicle(glasgow, { euroVI: false })).toEqual([
      { id: 'glasgow', name: 'Glasgow Low Emission Zone', status: 'charged', penaltyGBP: 60 },
    ]);
  });

  it('says a vehicle that has not said may be charged, and never reads that as fine', () => {
    expect(zonesForVehicle(glasgow, {})[0]?.status).toBe('may-be-charged');
    expect(zonesForVehicle(glasgow, { euroVI: undefined })[0]?.status).toBe('may-be-charged');
  });

  it('leaves a Euro VI vehicle’s list empty', () => {
    expect(zonesForVehicle(glasgow, { euroVI: true })).toEqual([]);
  });

  it('keeps the order it is given and has nothing for nothing', () => {
    const two = [zone('edinburgh'), zone('glasgow')];
    expect(zonesForVehicle(two, {}).map((z) => z.id)).toEqual(['edinburgh', 'glasgow']);
    expect(zonesForVehicle([], {})).toEqual([]);
  });
});

describe('the table itself', () => {
  it('has four Scottish zones, each with outlines of at least three points and somewhere in Scotland', () => {
    expect(LOW_EMISSION_ZONES.map((z) => z.id).sort()).toEqual([
      'aberdeen',
      'dundee',
      'edinburgh',
      'glasgow',
    ]);
    for (const z of LOW_EMISSION_ZONES) {
      expect(z.rings.length).toBeGreaterThan(0);
      for (const ring of z.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(3);
        for (const [lat, lon] of ring) {
          expect(lat).toBeGreaterThan(55);
          expect(lat).toBeLessThan(58);
          expect(lon).toBeGreaterThan(-5);
          expect(lon).toBeLessThan(-1.9);
        }
      }
    }
  });

  it('gives each zone a penalty, an enforcement day, a source and the day it was read', () => {
    for (const z of LOW_EMISSION_ZONES) {
      expect(z.penaltyGBP).toBe(60);
      expect(z.enforcedFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(z.sourceUrl).toMatch(/^https:\/\//);
      expect(z.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
