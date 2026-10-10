import { describe, expect, it } from 'vitest';
import {
  minutesForShareOf,
  nearestVertex,
  pathLengthM,
  requiredSavingMin,
  routeKey,
  totalMinutes,
} from './faster-route.js';

const line = [
  { lat: 55, lon: -2 },
  { lat: 55.01, lon: -2 },
  { lat: 55.02, lon: -2 },
];

describe('faster-route', () => {
  it('measures a line and finds the nearest vertex', () => {
    expect(pathLengthM(line)).toBeGreaterThan(2200);
    expect(pathLengthM(line)).toBeLessThan(2250);
    expect(nearestVertex(line, { lat: 55.0099, lon: -2 })?.index).toBe(1);
    expect(nearestVertex([], { lat: 55, lon: -2 })).toBeUndefined();
  });

  it('shares a plan time by the length left, never more than the plan', () => {
    expect(minutesForShareOf(40, 500, 1000)).toBe(20);
    expect(minutesForShareOf(40, 2000, 1000)).toBe(40);
    expect(minutesForShareOf(40, 10, 0)).toBe(0);
  });

  it('adds crowd waits and provider delay to the clear-road time', () => {
    expect(totalMinutes({ freeFlowMin: 30, crowdWaitMin: 5, trafficDelaySec: 600 })).toBe(45);
    expect(totalMinutes({ freeFlowMin: 30, crowdWaitMin: 5, trafficDelaySec: undefined })).toBe(35);
  });

  it('asks for the larger of 5 minutes and 10%', () => {
    expect(requiredSavingMin(30)).toBe(5);
    expect(requiredSavingMin(120)).toBe(12);
  });

  it('names a route the same way each time, differently for different routes', () => {
    expect(routeKey('abc')).toBe(routeKey('abc'));
    expect(routeKey('abc')).not.toBe(routeKey('abd'));
    expect(routeKey('abc')).toHaveLength(8);
  });
});
