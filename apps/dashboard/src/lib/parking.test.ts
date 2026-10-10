import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';
import { describe, expect, it } from 'vitest';
import {
  emptyForm,
  facilitiesSummary,
  formToRequest,
  parseLatLon,
  sourceOf,
  spotToForm,
} from './parking';

const spot = (extra: Partial<SafeParkingSpotDto> = {}): SafeParkingSpotDto =>
  ({
    id: 's1',
    location: { lat: 50.7, lon: -3.5 },
    reportedAt: '2026-10-10T09:00:00.000Z',
    ...extra,
  }) as SafeParkingSpotDto;

describe('parseLatLon', () => {
  it('reads two numbers however they are separated', () => {
    expect(parseLatLon('51.5074, -0.1278')).toEqual({ lat: 51.5074, lon: -0.1278 });
    expect(parseLatLon(' 51.5074 -0.1278 ')).toEqual({ lat: 51.5074, lon: -0.1278 });
    expect(parseLatLon('51.5074,-0.1278')).toEqual({ lat: 51.5074, lon: -0.1278 });
  });

  it('refuses anything else', () => {
    for (const bad of ['', '51.5', '51.5, -0.1, 3', 'London', '91, 0', '0, 181', 'a, b']) {
      expect(parseLatLon(bad)).toBeUndefined();
    }
  });
});

describe('facilitiesSummary', () => {
  it('lists what is there and says free when it is known to cost nothing', () => {
    expect(facilitiesSummary(spot({ paid: true, toilets: true, showers: true }))).toBe(
      'Paid, Toilets, Showers',
    );
    expect(facilitiesSummary(spot({ paid: false, food: true }))).toBe('Free, Food');
  });

  it('says nothing about what nobody has said, and nothing for a "no"', () => {
    expect(facilitiesSummary(spot())).toBe('');
    expect(facilitiesSummary(spot({ toilets: false }))).toBe('');
  });
});

describe('the form', () => {
  it('turns a filled-in form into a request, leaving unknowns out', () => {
    const form = emptyForm();
    form.location = '50.7, -3.5';
    form.name = ' Exeter Truckstop ';
    form.capacity = '40';
    form.facilities.paid = 'yes';
    form.facilities.showers = 'no';
    expect(formToRequest(form)).toEqual({
      ok: true,
      request: {
        location: { lat: 50.7, lon: -3.5 },
        kind: 'parking',
        name: 'Exeter Truckstop',
        capacity: 40,
        paid: true,
        showers: false,
      },
    });
  });

  it('says what is wrong with a place or a number of spaces', () => {
    const form = emptyForm();
    expect(formToRequest(form).ok).toBe(false);
    form.location = '50.7, -3.5';
    form.capacity = '4.5';
    expect(formToRequest(form)).toEqual({
      ok: false,
      problem: 'Spaces should be a whole number, or left empty.',
    });
  });

  it('fills the form from a spot and back again', () => {
    const original = spot({
      name: 'A38 layby',
      note: 'quiet',
      capacity: 6,
      toilets: true,
      lit: false,
    });
    const form = spotToForm(original);
    expect(form.facilities.toilets).toBe('yes');
    expect(form.facilities.lit).toBe('no');
    expect(form.facilities.shop).toBe('unknown');
    const back = formToRequest(form);
    expect(back).toEqual({
      ok: true,
      request: {
        location: { lat: 50.7, lon: -3.5 },
        kind: 'parking',
        name: 'A38 layby',
        note: 'quiet',
        capacity: 6,
        toilets: true,
        lit: false,
      },
    });
  });
});

describe('sourceOf', () => {
  it('reads a spot from an older server as a driver’s report', () => {
    expect(sourceOf(spot())).toBe('driver');
    expect(sourceOf(spot({ source: 'osm' }))).toBe('osm');
  });
});
