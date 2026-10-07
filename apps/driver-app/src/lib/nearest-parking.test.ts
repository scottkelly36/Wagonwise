import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';

import { nearestParkingSpots } from './nearest-parking';

function spot(id: string, lat: number, lon: number): SafeParkingSpotDto {
  return {
    id,
    reporterId: '22222222-2222-4222-8222-222222222222',
    location: { lat, lon },
    reportedAt: '2026-10-01T10:00:00.000Z',
  } as SafeParkingSpotDto;
}

const hexham = { lat: 54.9707, lon: -2.1013 };

describe('nearestParkingSpots', () => {
  it('orders by straight-line distance, nearest first', () => {
    const ranked = nearestParkingSpots(
      [spot('far', 55.2, -2.1), spot('near', 54.972, -2.1), spot('mid', 55.0, -2.1)],
      hexham,
    );
    expect(ranked.map((r) => r.spot.id)).toEqual(['near', 'mid', 'far']);
    expect(ranked[0].distanceM).toBeLessThan(ranked[1].distanceM);
  });

  it('keeps only the requested number', () => {
    const many = Array.from({ length: 9 }, (_, i) => spot(`s${i}`, 54.97 + i * 0.01, -2.1));
    expect(nearestParkingSpots(many, hexham, 3)).toHaveLength(3);
    expect(nearestParkingSpots(many, hexham)).toHaveLength(5);
  });

  it('gives an empty list when there are none', () => {
    expect(nearestParkingSpots([], hexham)).toEqual([]);
  });
});
