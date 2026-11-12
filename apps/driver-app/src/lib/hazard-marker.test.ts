import { hazardCountLine, hazardMarkerFigure, hazardOnRouteLine } from './hazard-marker';

describe('the figure on a hazard marker', () => {
  it('is the height in metres and feet and inches for a low bridge', () => {
    expect(hazardMarkerFigure({ kind: 'height', value: 4.1, unit: 'm' })).toBe('4.1m (13\'5")');
  });

  it('is the weight for a weight limit, and nothing for a report with no figure', () => {
    expect(hazardMarkerFigure({ kind: 'weight', value: 7.5, unit: 't' })).toBe('7.5t');
    expect(hazardMarkerFigure(undefined)).toBeUndefined();
  });
});

describe('a hazard in the route overview list', () => {
  it("puts the vehicle's own height beside a bridge's, and how far along the route it is", () => {
    expect(
      hazardOnRouteLine({
        type: 'low_bridge',
        measurement: { kind: 'height', value: 4.1, unit: 'm' },
        vehicle: { heightM: 3.8, widthM: 2.55, grossWeightT: 18 },
        offsetM: 3_200,
        distanceUnit: 'miles',
      }),
    ).toBe('Low bridge · 4.1m (13\'5") · your vehicle 3.8m (12\'6") · 2.0 mi in');
  });

  it("uses the vehicle's weight for a weight limit", () => {
    expect(
      hazardOnRouteLine({
        type: 'weight_limit',
        measurement: { kind: 'weight', value: 7.5, unit: 't' },
        vehicle: { heightM: 3.8, grossWeightT: 18 },
        distanceUnit: 'km',
      }),
    ).toBe('Too heavy for this road · 7.5t · your vehicle 18t');
  });

  it('never says whether the vehicle clears it', () => {
    const line = hazardOnRouteLine({
      type: 'low_bridge',
      measurement: { kind: 'height', value: 4.1, unit: 'm' },
      vehicle: { heightM: 3.8 },
      distanceUnit: 'km',
    });
    expect(line).not.toMatch(/safe|clear|fits|spare/i);
  });

  it('is just the name when nothing else is known', () => {
    expect(hazardOnRouteLine({ type: 'roadworks', distanceUnit: 'km' })).toBe('Roadworks');
  });
});

describe('the hazard count on a route card', () => {
  it('reads naturally for none, one and several', () => {
    expect(hazardCountLine(0)).toBe('No hazards reported on this route');
    expect(hazardCountLine(1)).toBe('1 hazard reported on this route');
    expect(hazardCountLine(3)).toBe('3 hazards reported on this route');
  });
});
