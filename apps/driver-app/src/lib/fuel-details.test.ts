import type { FuelStationDto } from '@wagonwise/contracts/fuel';

import {
  addressText,
  FUEL_MAX_AGE_DAYS,
  priceText,
  sortFuel,
  stationTitle,
  updatedText,
} from './fuel-details';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const station = (overrides: Partial<FuelStationDto> = {}): FuelStationDto => ({
  id: 'a',
  name: 'Station A',
  location: { lat: 54.97, lon: -2.1 },
  isMotorway: false,
  isSupermarket: false,
  amenities: [],
  pencePerLitre: 198.9,
  priceUpdatedAt: ago(HOUR),
  distanceM: 1000,
  ...overrides,
});

describe('priceText', () => {
  it('shows pence to one decimal place', () => {
    expect(priceText(198.9)).toBe('198.9p');
    expect(priceText(200)).toBe('200.0p');
  });
});

describe('updatedText', () => {
  it.each([
    [10_000, 'Updated just now'],
    [MIN, 'Updated 1 minute ago'],
    [45 * MIN, 'Updated 45 minutes ago'],
    [HOUR, 'Updated 1 hour ago'],
    [23 * HOUR + 59 * MIN, 'Updated 23 hours ago'],
    [DAY, 'Updated yesterday'],
    [4 * DAY + 3 * HOUR, 'Updated 4 days ago'],
    [-5 * MIN, 'Updated just now'],
  ])('says when a price %i ms old was reported', (age, text) => {
    expect(updatedText(ago(age), NOW)).toBe(text);
  });
});

describe('addressText and stationTitle', () => {
  it('joins the parts a station has', () => {
    expect(
      addressText(station({ addressLine: 'Station Road', city: 'Hexham', postcode: 'NE46 1AA' })),
    ).toBe('Station Road, Hexham, NE46 1AA');
    expect(addressText(station({ city: 'Hexham' }))).toBe('Hexham');
    expect(addressText(station())).toBeUndefined();
  });

  it('titles a row by brand, else by name', () => {
    expect(stationTitle(station({ brand: 'TESCO' }))).toBe('TESCO');
    expect(stationTitle(station())).toBe('Station A');
  });
});

describe('sortFuel', () => {
  const list = [
    station({ id: 'dear-near', pencePerLitre: 205, distanceM: 500 }),
    station({ id: 'cheap-far', pencePerLitre: 190, distanceM: 9000 }),
    station({ id: 'cheap-near', pencePerLitre: 190, distanceM: 2000 }),
  ];

  it('orders by price, nearer first on a tie', () => {
    expect(sortFuel(list, 'cheapest').map((s) => s.id)).toEqual([
      'cheap-near',
      'cheap-far',
      'dear-near',
    ]);
  });

  it('orders by distance, cheaper first on a tie', () => {
    expect(sortFuel(list, 'closest').map((s) => s.id)).toEqual([
      'dear-near',
      'cheap-near',
      'cheap-far',
    ]);
  });

  it('does not change the list it is given', () => {
    const before = list.map((s) => s.id);
    sortFuel(list, 'closest');
    expect(list.map((s) => s.id)).toEqual(before);
  });
});

describe('FUEL_MAX_AGE_DAYS', () => {
  it('is a week', () => {
    expect(FUEL_MAX_AGE_DAYS).toBe(7);
  });
});
