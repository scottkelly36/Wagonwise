import { describe, expect, it } from 'vitest';
import { applies } from './avoidance-policy.js';
import type { Dimensions } from './vehicle-profile.js';
import type { ObstructionKind, ReportedObstruction } from './reported-obstruction.js';

const zone = { points: [{ lat: 54.98, lon: -2.1 }] };

function obstruction(
  kind: ObstructionKind,
  overrides: Partial<ReportedObstruction> = {},
): ReportedObstruction {
  return { id: 'obstruction-1', kind, zone, ...overrides };
}

function dimensions(overrides: Partial<Dimensions> = {}): Dimensions {
  return { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, ...overrides };
}

describe('applies', () => {
  describe.each([
    { kind: 'height' as const, field: 'heightM' as const },
    { kind: 'width' as const, field: 'widthM' as const },
    { kind: 'weight' as const, field: 'grossWeightT' as const },
  ])('measured restriction: $kind', ({ kind, field }) => {
    it('does not apply when the vehicle is under the limit', () => {
      const o = obstruction(kind, { limit: 3.5 });
      const d = dimensions({ [field]: 3.0 });
      expect(applies(o, d)).toBe(false);
    });

    it('does not apply when the vehicle is exactly at the limit (a maxheight sign is inclusive)', () => {
      const o = obstruction(kind, { limit: 3.5 });
      const d = dimensions({ [field]: 3.5 });
      expect(applies(o, d)).toBe(false);
    });

    it('applies when the vehicle exceeds the limit', () => {
      const o = obstruction(kind, { limit: 3.5 });
      const d = dimensions({ [field]: 3.6 });
      expect(applies(o, d)).toBe(true);
    });

    it('applies to every vehicle when no measurement was given, however small', () => {
      const o = obstruction(kind); // no limit key at all
      const d = dimensions({ [field]: 0.01 });
      expect(applies(o, d)).toBe(true);
    });
  });

  describe('prohibition (e.g. "no HGV")', () => {
    it('always applies, with no limit', () => {
      expect(applies(obstruction('prohibition'), dimensions())).toBe(true);
    });

    it('always applies, even if a limit is somehow present (never consulted)', () => {
      expect(applies(obstruction('prohibition', { limit: 3.5 }), dimensions())).toBe(true);
    });

    it('applies regardless of how small the vehicle is', () => {
      const tiny = dimensions({ heightM: 0.1, widthM: 0.1, lengthM: 0.1, grossWeightT: 0.1 });
      expect(applies(obstruction('prohibition'), tiny)).toBe(true);
    });
  });

  it('the design doc’s own example: a 3.5m bridge is avoided by a 4.2m HGV, not by a 3.2m van', () => {
    const bridge = obstruction('height', { limit: 3.5 });
    expect(applies(bridge, dimensions({ heightM: 4.2 }))).toBe(true);
    expect(applies(bridge, dimensions({ heightM: 3.2 }))).toBe(false);
  });

  it('is a pure function of its two inputs — same inputs, same output, no matter how many times called', () => {
    const o = obstruction('height', { limit: 3.5 });
    const d = dimensions({ heightM: 4.2 });
    const results = Array.from({ length: 5 }, () => applies(o, d));
    expect(results).toEqual([true, true, true, true, true]);
  });
});
