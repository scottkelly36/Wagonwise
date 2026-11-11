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
  // Compared by eye against OpenStreetMap streets on 2026-11-11, not against the councils' own maps: these are sanity checks that each outline landed
  // in the right place, not a statement of where each council draws its line.
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
    ['tyneside', 'Newcastle Central station', 54.9686, -1.6174],
    ['tyneside', 'Grey Street', 54.9738, -1.613],
    ['bradford', 'Bradford Interchange', 53.7918, -1.7498],
    ['bradford', 'Bradford City Hall', 53.7931, -1.7524],
    ['sheffield', 'Fargate', 53.3814, -1.4701],
    ['birmingham', 'New Street station', 52.4778, -1.8984],
    ['birmingham', 'Bullring', 52.4779, -1.8938],
    ['bristol', 'Temple Meads', 51.4491, -2.5813],
    ['bristol', 'Cabot Circus', 51.4585, -2.5832],
    ['bath', 'Bath Abbey', 51.3812, -2.359],
    ['bath', 'Pulteney Bridge', 51.384, -2.3585],
    ['portsmouth', 'Guildhall Square', 50.7993, -1.091],
    ['portsmouth', 'Portsmouth and Southsea station', 50.7985, -1.0912],
    ['london', 'Trafalgar Square', 51.508, -0.1281],
    ['london', 'Heathrow Airport', 51.47, -0.4543],
    ['london', 'Croydon', 51.3762, -0.0982],
  ])('has the %s zone around %s', (id, _name, lat, lon) => {
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
    ['tyneside', 'the Metrocentre', 54.9602, -1.6679],
    // The Gateshead quayside is outside the Tyneside zone: it covers Newcastle's centre and the river crossings.
    ['tyneside', 'Gateshead Millennium Bridge', 54.9689, -1.5994],
    ['bradford', 'Leeds city centre', 53.7997, -1.5492],
    ['sheffield', 'Meadowhall', 53.4146, -1.413],
    // Sheffield station is just outside the inner ring road, which is the zone's edge.
    ['sheffield', 'Sheffield station', 53.3781, -1.462],
    ['birmingham', 'the NEC', 52.4531, -1.7197],
    ['bristol', 'Bristol Airport', 51.3827, -2.7191],
    ['bath', 'Bristol city centre', 51.4545, -2.5879],
    ['portsmouth', 'Southampton', 50.9097, -1.4044],
    ['london', 'Gatwick Airport', 51.1537, -0.1821],
    ['london', 'Watford', 51.6565, -0.3903],
  ])('keeps the %s zone off %s', (id, _name, lat, lon) => {
    expect(zoneContains(zone(id), at(lat, lon))).toBe(false);
  });

  it('does not put a place in another city’s zone', () => {
    expect(zoneContains(zone('glasgow'), at(55.952, -3.1896))).toBe(false);
    expect(zoneContains(zone('edinburgh'), at(55.8611, -4.2502))).toBe(false);
    expect(zoneContains(zone('sheffield'), at(52.4778, -1.8984))).toBe(false);
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

  it('finds an English zone, and London, on a route south', () => {
    const route = [
      at(54.9686, -1.6174), // Newcastle
      at(53.3814, -1.4701), // Sheffield
      at(51.508, -0.1281), // London
    ];
    expect(zonesEntered(route).map((z) => z.id)).toEqual(['tyneside', 'sheffield', 'london']);
  });

  it('says nothing for a route that stays out, or has no points', () => {
    expect(zonesEntered([at(54.9783, -1.9), at(54.9, -1.9)])).toEqual([]);
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
      {
        id: 'glasgow',
        name: 'Glasgow Low Emission Zone',
        status: 'charged',
        charge: { kind: 'penalty', firstGBP: 60 },
      },
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

  it('carries an English zone’s daily charge, and London’s range', () => {
    const [bristol, london] = zonesForVehicle([zone('bristol'), zone('london')], {});
    expect(bristol?.charge).toEqual({ kind: 'daily', lowGBP: 100, highGBP: 100 });
    expect(london?.charge).toEqual({ kind: 'daily', lowGBP: 100, highGBP: 300 });
  });
});

describe('the table itself', () => {
  it('has twelve zones: Scotland’s four, seven English clean air zones and London, and not Oxford', () => {
    expect(LOW_EMISSION_ZONES.map((z) => z.id).sort()).toEqual([
      'aberdeen',
      'bath',
      'birmingham',
      'bradford',
      'bristol',
      'dundee',
      'edinburgh',
      'glasgow',
      'london',
      'portsmouth',
      'sheffield',
      'tyneside',
    ]);
  });

  it('gives each zone outlines of at least three points, somewhere in Britain', () => {
    for (const z of LOW_EMISSION_ZONES) {
      expect(z.rings.length).toBeGreaterThan(0);
      for (const ring of z.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(3);
        for (const [lat, lon] of ring) {
          expect(lat).toBeGreaterThan(50);
          expect(lat).toBeLessThan(58);
          expect(lon).toBeGreaterThan(-5);
          expect(lon).toBeLessThan(0.5);
        }
      }
    }
  });

  it('gives Scotland the national penalty and England a daily charge, each with a source and the day it was read', () => {
    for (const z of LOW_EMISSION_ZONES) {
      expect(z.enforcedFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(z.sourceUrl).toMatch(/^https:\/\//);
      expect(z.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (['glasgow', 'edinburgh', 'dundee', 'aberdeen'].includes(z.id)) {
        expect(z.charge).toEqual({ kind: 'penalty', firstGBP: 60 });
      } else {
        expect(z.charge.kind).toBe('daily');
        if (z.charge.kind === 'daily') {
          expect(z.charge.lowGBP).toBeGreaterThan(0);
          expect(z.charge.highGBP).toBeGreaterThanOrEqual(z.charge.lowGBP);
        }
      }
    }
  });

  it('has the lorry rates read from the councils’ pages', () => {
    const rate = (id: string) => {
      const c = zone(id).charge;
      return c.kind === 'daily' ? [c.lowGBP, c.highGBP] : undefined;
    };
    expect(rate('bristol')).toEqual([100, 100]);
    expect(rate('bath')).toEqual([100, 100]);
    expect(rate('bradford')).toEqual([50, 50]);
    expect(rate('sheffield')).toEqual([50, 50]);
    expect(rate('birmingham')).toEqual([50, 50]);
    expect(rate('portsmouth')).toEqual([50, 50]);
    expect(rate('tyneside')).toEqual([50, 50]);
    expect(rate('london')).toEqual([100, 300]);
  });
});
