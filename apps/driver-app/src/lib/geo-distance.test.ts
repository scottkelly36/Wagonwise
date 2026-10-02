import { distanceMetres } from './geo-distance';

describe('distanceMetres', () => {
  it('is zero for the same point', () => {
    expect(distanceMetres({ lat: 54.97, lon: -2.1 }, { lat: 54.97, lon: -2.1 })).toBe(0);
  });

  it('is about 111.3km for one degree of latitude', () => {
    const d = distanceMetres({ lat: 54.0, lon: -2.1 }, { lat: 55.0, lon: -2.1 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_600);
  });

  it('shrinks a degree of longitude by cos(latitude), not treating it the same as latitude', () => {
    const atEquator = distanceMetres({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const atHighLatitude = distanceMetres({ lat: 60, lon: 0 }, { lat: 60, lon: 1 });
    expect(atHighLatitude).toBeLessThan(atEquator);
  });

  it('is small for two points a few hundred metres apart', () => {
    // Roughly 220m apart (0.002 degrees of latitude).
    const d = distanceMetres({ lat: 54.97, lon: -2.1 }, { lat: 54.972, lon: -2.1 });
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(250);
  });
});
