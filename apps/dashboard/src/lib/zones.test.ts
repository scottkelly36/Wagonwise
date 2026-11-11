import type { LowEmissionZoneDto } from '@wagonwise/contracts/routing';
import { describe, expect, it } from 'vitest';

import { euroVIState, zoneAt, zoneNote, zonesGeoJson } from './zones';

// A square about 1 km across near Glasgow, and a second one, so "which zone" can be told apart. Rings are [latitude, longitude].
const square = (id: string, name: string, lat: number, lon: number): LowEmissionZoneDto => ({
  id,
  name,
  penaltyGBP: 60,
  enforcedFrom: '2023-06-01',
  rings: [
    [
      [lat, lon],
      [lat, lon + 0.015],
      [lat + 0.009, lon + 0.015],
      [lat + 0.009, lon],
    ],
  ],
});
const glasgow = square('glasgow', 'Glasgow Low Emission Zone', 55.855, -4.26);
const edinburgh = square('edinburgh', 'Edinburgh Low Emission Zone', 55.945, -3.2);

describe('zoneAt', () => {
  it('names the zone a position is inside', () => {
    expect(zoneAt([glasgow, edinburgh], { lat: 55.8595, lon: -4.2525 })?.id).toBe('glasgow');
    expect(zoneAt([glasgow, edinburgh], { lat: 55.9495, lon: -3.1925 })?.id).toBe('edinburgh');
  });

  it('says nothing for a position outside every zone', () => {
    expect(zoneAt([glasgow, edinburgh], { lat: 54.9783, lon: -1.6178 })).toBeUndefined();
    expect(zoneAt([], { lat: 55.8595, lon: -4.2525 })).toBeUndefined();
  });

  it('counts a position in any piece of a zone made of several', () => {
    const pieces: LowEmissionZoneDto = {
      ...glasgow,
      rings: [
        ...glasgow.rings,
        [
          [56, -3],
          [56, -2.99],
          [56.01, -2.99],
          [56.01, -3],
        ],
      ],
    };
    expect(zoneAt([pieces], { lat: 56.005, lon: -2.995 })?.id).toBe('glasgow');
  });
});

describe('zonesGeoJson', () => {
  it('gives one feature per zone, longitude first and each outline closed', () => {
    const data = zonesGeoJson([glasgow]);
    expect(data.features).toHaveLength(1);
    const outline = data.features[0]?.geometry.coordinates[0]?.[0] ?? [];
    expect(outline[0]).toEqual([-4.26, 55.855]);
    expect(outline[outline.length - 1]).toEqual(outline[0]);
    expect(outline).toHaveLength(5);
  });

  it('says what a click shows, with the penalty', () => {
    expect(zonesGeoJson([glasgow]).features[0]?.properties.title).toMatch(
      /Glasgow Low Emission Zone.*£60/,
    );
  });

  it('has nothing to draw for no zones', () => {
    expect(zonesGeoJson([]).features).toEqual([]);
  });
});

describe('euroVIState', () => {
  const vehicle = (euroVI?: boolean) => ({ dimensions: euroVI === undefined ? {} : { euroVI } });

  it('tells yes, no and not said apart, so a "no" is not read as missing', () => {
    expect(euroVIState(vehicle(true))).toBe('yes');
    expect(euroVIState(vehicle(false))).toBe('no');
    expect(euroVIState(vehicle())).toBe('not-said');
  });

  it('says the vehicle is not known when the page does not have it', () => {
    expect(euroVIState(undefined)).toBe('unknown-vehicle');
  });
});

describe('zoneNote', () => {
  it('says a penalty applies for a vehicle the company says is not Euro VI', () => {
    expect(zoneNote(glasgow, 'no', true)).toEqual({
      text: 'In the Glasgow Low Emission Zone. The vehicle is not Euro VI: a £60 penalty applies, more if repeated.',
      tone: 'danger',
    });
  });

  it('says a penalty may apply when Euro VI is not stated, and where to set it', () => {
    const note = zoneNote(glasgow, 'not-said', true);
    expect(note.tone).toBe('warn');
    expect(note.text).toMatch(/not stated.*may apply.*Set it on the vehicle/);
  });

  it('repeats what the company said for a vehicle marked Euro VI, without calling it compliant', () => {
    const note = zoneNote(glasgow, 'yes', true);
    expect(note).toEqual({
      text: 'In the Glasgow Low Emission Zone. The vehicle is marked Euro VI.',
      tone: 'ok',
    });
    expect(note.text).not.toMatch(/complian/i);
  });

  it('asks to check when the vehicle is not known', () => {
    expect(zoneNote(glasgow, 'unknown-vehicle', true).tone).toBe('warn');
  });

  it('says "last seen in" for an old position, not "in"', () => {
    expect(zoneNote(glasgow, 'no', false).text).toMatch(/^Last seen in the Glasgow/);
    expect(zoneNote(glasgow, 'no', true).text).toMatch(/^In the Glasgow/);
  });
});
