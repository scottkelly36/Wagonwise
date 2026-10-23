import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from '../../../shared/result.js';
import type {
  LookupNotFound,
  LookupUnavailable,
  VehicleDates,
  VehicleLookup,
} from '../application/ports/vehicle-lookup.js';
import { CombinedVehicleLookup } from './combined-vehicle-lookup.js';

type Answer = Result<VehicleDates, LookupNotFound | LookupUnavailable>;

const source = (answer: Answer, configured = true): VehicleLookup => ({
  configured,
  lookup: () => Promise.resolve(answer),
});

const mot = ok<VehicleDates>({ motExpiry: '2027-07-11', motStatus: 'Valid' });
const tax = ok<VehicleDates>({
  motExpiry: '2027-01-01',
  motStatus: 'Valid',
  taxDue: '2026-12-01',
  taxStatus: 'Taxed',
});
const notFound = err({ tag: 'LookupNotFound' as const });
const unavailable = err({ tag: 'LookupUnavailable' as const });

describe('CombinedVehicleLookup', () => {
  it('takes the MOT from the first source that has one and the tax from the one that has it', async () => {
    const result = await new CombinedVehicleLookup([source(mot), source(tax)]).lookup('AB12CDE');
    expect(result).toEqual({
      ok: true,
      value: {
        motExpiry: '2027-07-11',
        motStatus: 'Valid',
        taxDue: '2026-12-01',
        taxStatus: 'Taxed',
      },
    });
  });

  it('uses the other source for the MOT when the first has no date', async () => {
    const noDate = ok<VehicleDates>({ motExpiry: undefined, motStatus: 'No test on record' });
    const result = await new CombinedVehicleLookup([source(noDate), source(tax)]).lookup('AB12CDE');
    expect(result).toMatchObject({
      ok: true,
      value: { motExpiry: '2027-01-01', motStatus: 'Valid' },
    });
  });

  it('is not spoiled by one source being down or not knowing the vehicle', async () => {
    const down = await new CombinedVehicleLookup([source(unavailable), source(tax)]).lookup(
      'AB12CDE',
    );
    expect(down).toMatchObject({ ok: true, value: { taxDue: '2026-12-01' } });
    const missing = await new CombinedVehicleLookup([source(notFound), source(mot)]).lookup(
      'AB12CDE',
    );
    expect(missing).toMatchObject({ ok: true, value: { motExpiry: '2027-07-11' } });
  });

  it('says not found only when every source does, and otherwise unavailable', async () => {
    expect(
      await new CombinedVehicleLookup([source(notFound), source(notFound)]).lookup('AB12CDE'),
    ).toEqual({ ok: false, error: { tag: 'LookupNotFound' } });
    expect(
      await new CombinedVehicleLookup([source(notFound), source(unavailable)]).lookup('AB12CDE'),
    ).toEqual({ ok: false, error: { tag: 'LookupUnavailable' } });
  });

  it('ignores a source that is not switched on, and is off when none is', async () => {
    const result = await new CombinedVehicleLookup([
      source(unavailable, false),
      source(mot),
    ]).lookup('AB12CDE');
    expect(result).toMatchObject({ ok: true });
    expect(new CombinedVehicleLookup([source(mot, false)]).configured).toBe(false);
    expect(new CombinedVehicleLookup([source(mot, false), source(mot)]).configured).toBe(true);
  });
});
