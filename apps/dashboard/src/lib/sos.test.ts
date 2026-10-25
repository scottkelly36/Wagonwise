import { describe, expect, it } from 'vitest';
import { contactHref, sinceText, sosMapLink, vehicleText, whereText } from './sos';

describe('contactHref', () => {
  it.each([
    ['+447700900123', 'tel:+447700900123'],
    ['07700 900 123', 'tel:07700900123'],
    ['+44 (0)7700-900123', 'tel:+4407700900123'],
    ['pat@example.com', 'mailto:pat@example.com'],
    ['not a number', undefined],
    ['123', undefined],
  ])('turns %j into %j', (contact, href) => {
    expect(contactHref(contact)).toBe(href);
  });
});

describe('sinceText', () => {
  const now = new Date('2026-10-25T10:00:00.000Z');
  it.each([
    ['2026-10-25T10:00:00.000Z', 'just now'],
    ['2026-10-25T09:59:00.000Z', '1 minute ago'],
    ['2026-10-25T09:40:00.000Z', '20 minutes ago'],
    ['2026-10-25T09:00:00.000Z', '1 hour ago'],
    ['2026-10-25T06:30:00.000Z', '3 hours ago'],
    ['2026-10-25T10:05:00.000Z', 'just now'],
  ])('says %s was %s', (at, text) => {
    expect(sinceText(at, now)).toBe(text);
  });
});

describe('whereText', () => {
  it('gives the three words and the nearest town, or the position when there are no words', () => {
    const location = { lat: 54.9731, lon: -2.1013 };
    expect(whereText({ words: 'filled.count.soap', nearestPlace: 'Hexham', location })).toBe(
      '///filled.count.soap, near Hexham',
    );
    expect(whereText({ words: 'filled.count.soap', nearestPlace: undefined, location })).toBe(
      '///filled.count.soap',
    );
    expect(whereText({ words: undefined, nearestPlace: undefined, location })).toBe(
      '54.97310, -2.10130',
    );
  });
});

describe('vehicleText', () => {
  it('joins what there is', () => {
    expect(vehicleText({ vehicleName: 'Scania', vehicleRegistration: 'AB12 CDE' })).toBe(
      'Scania AB12 CDE',
    );
    expect(vehicleText({ vehicleName: undefined, vehicleRegistration: 'AB12 CDE' })).toBe(
      'AB12 CDE',
    );
    expect(vehicleText({ vehicleName: undefined, vehicleRegistration: undefined })).toBeUndefined();
  });
});

describe('sosMapLink', () => {
  it('opens the spot on OpenStreetMap', () => {
    expect(sosMapLink({ lat: 54.97, lon: -2.1 })).toBe(
      'https://www.openstreetmap.org/?mlat=54.97&mlon=-2.1#map=18/54.97/-2.1',
    );
  });
});
