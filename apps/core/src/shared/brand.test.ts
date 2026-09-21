import { describe, expect, it } from 'vitest';
import { makeId, type Id } from './brand.js';

type DriverId = Id<'DriverId'>;
type HazardReportId = Id<'HazardReportId'>;

const takesDriver = (id: DriverId): string => id;

describe('branded IDs', () => {
  it('are plain strings at runtime', () => {
    const id: DriverId = makeId<'DriverId'>('d-1');
    expect(id).toBe('d-1');
    expect(typeof id).toBe('string');
  });

  it('refuse to be mixed up at compile time', () => {
    const driver: DriverId = makeId<'DriverId'>('d-1');
    const hazard: HazardReportId = makeId<'HazardReportId'>('h-1');

    expect(takesDriver(driver)).toBe('d-1');
    // These lines are the test: if the brands ever stop being nominal, the directives become
    // unused and `pnpm typecheck` fails.
    // @ts-expect-error a HazardReportId is not a DriverId
    takesDriver(hazard);
    // @ts-expect-error a bare string is not a DriverId either
    takesDriver('d-1');
  });

  it('rejects the empty string, which is never a legitimate ID', () => {
    expect(() => makeId<'DriverId'>('')).toThrow('cannot be empty');
  });
});
