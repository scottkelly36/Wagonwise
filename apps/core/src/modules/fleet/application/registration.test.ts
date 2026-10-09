import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { Dimensions } from '../domain/vehicle.js';
import { createFleetVehicle } from './create-fleet-vehicle.js';
import type { Caller } from './ports/caller-directory.js';
import { InMemoryFleetVehicleRepository } from './testing/in-memory-fleet-vehicle-repository.js';
import { updateFleetVehicle } from './update-fleet-vehicle.js';

const acme = makeId<'CompanyId'>('company-1');
const beta = makeId<'CompanyId'>('company-2');
const ADMIN: Caller = { kind: 'platform' };
const dimensions: Dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };

function setup() {
  const repo = new InMemoryFleetVehicleRepository();
  const ids = new SequentialIdGenerator();
  const create = (companyId = acme, registration?: string, name = 'Wagon') =>
    createFleetVehicle(
      {
        repo,
        ids,
        capacity: { capacityFor: () => Promise.resolve(99) },
      },
      { caller: ADMIN, companyId, name, dimensions, registration },
    );
  const update = (id: string, input: { registration?: string; name?: string }) =>
    updateFleetVehicle(
      { repo },
      {
        caller: ADMIN,
        id: makeId<'FleetVehicleId'>(id),
        name: input.name ?? 'Wagon',
        dimensions,
        registration: input.registration,
      },
    );
  return { repo, create, update };
}

describe('creating a vehicle with a registration', () => {
  it('keeps it tidy, and a vehicle with none is fine', async () => {
    const { create } = setup();
    const withPlate = await create(acme, 'ab12 cde');
    expect(withPlate.ok && withPlate.value.registration).toBe('AB12CDE');
    const without = await create(acme, undefined, 'Spare');
    expect(without.ok && without.value.registration).toBeUndefined();
    const blank = await create(acme, '  ', 'Blank');
    expect(blank.ok && blank.value.registration).toBeUndefined();
  });

  it('refuses a registration another vehicle in the company has, however it is typed', async () => {
    const { create } = setup();
    await create(acme, 'AB12CDE');
    expect(await create(acme, 'ab12 cde', 'Again')).toEqual({
      ok: false,
      error: { tag: 'RegistrationTaken' },
    });
  });

  it('lets two companies each have the same registration', async () => {
    const { create } = setup();
    await create(acme, 'AB12CDE');
    expect((await create(beta, 'AB12CDE')).ok).toBe(true);
  });

  it('refuses a registration that is not one', async () => {
    const { create } = setup();
    expect(await create(acme, 'A!')).toEqual({
      ok: false,
      error: { tag: 'InvalidRegistration', reason: 'bad_characters' },
    });
  });
});

describe('changing a vehicle’s registration', () => {
  it('sets it, changes it, and keeps it when left out', async () => {
    const { create, update } = setup();
    const made = await create(acme, undefined);
    if (!made.ok) throw new Error('setup');
    const set = await update(made.value.id, { registration: 'xy99 zzz' });
    expect(set.ok && set.value.registration).toBe('XY99ZZZ');
    const kept = await update(made.value.id, { name: 'Renamed' });
    expect(kept.ok && [kept.value.name, kept.value.registration]).toEqual(['Renamed', 'XY99ZZZ']);
  });

  it('clears it when sent blank', async () => {
    const { create, update } = setup();
    const made = await create(acme, 'AB12CDE');
    if (!made.ok) throw new Error('setup');
    const cleared = await update(made.value.id, { registration: '' });
    expect(cleared.ok && cleared.value.registration).toBeUndefined();
  });

  it('refuses another vehicle’s registration, but not its own again', async () => {
    const { create, update } = setup();
    const a = await create(acme, 'AB12CDE', 'A');
    const b = await create(acme, 'XY99ZZZ', 'B');
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(await update(b.value.id, { registration: 'ab12 cde' })).toEqual({
      ok: false,
      error: { tag: 'RegistrationTaken' },
    });
    expect((await update(a.value.id, { registration: 'AB12 CDE' })).ok).toBe(true);
  });
});
