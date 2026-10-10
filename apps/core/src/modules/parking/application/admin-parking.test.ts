import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import {
  addSpot,
  deleteSpot,
  listSpots,
  updateSpot,
  type AdminParkingDeps,
  type StaffCaller,
} from './admin-parking.js';
import { InMemoryParkingRepository } from './testing/in-memory-parking-repository.js';

const platform: StaffCaller = { kind: 'platform' };
const fleet: StaffCaller = { kind: 'fleet', companyId: 'c', privileges: ['manage_fleet'] };
const where = { lat: 50.7, lon: -3.5 };

function setup() {
  const repo = new InMemoryParkingRepository();
  const deps: AdminParkingDeps = {
    repo,
    ids: new SequentialIdGenerator(),
    clock: new FakeClock('2026-10-10T09:00:00.000Z'),
  };
  return { deps, repo };
}

describe('addSpot', () => {
  it('adds a spot with no reporter, marked as added by staff, with its details', async () => {
    const { deps, repo } = setup();
    const result = await addSpot(deps, platform, {
      location: where,
      name: '  Exeter Truckstop ',
      note: 'Behind the services',
      capacity: 40,
      paid: true,
      toilets: true,
      showers: false,
    });
    expect(result.ok).toBe(true);
    const saved = (await repo.search({ limit: 10 })).spots[0];
    expect(saved).toMatchObject({
      source: 'admin',
      name: 'Exeter Truckstop',
      capacity: 40,
      paid: true,
      toilets: true,
      showers: false,
    });
    expect(saved?.reporterId).toBeUndefined();
    expect(saved?.shop).toBeUndefined();
  });

  it('treats blank words as nothing, and refuses a note that is too long', async () => {
    const { deps, repo } = setup();
    expect((await addSpot(deps, platform, { location: where, name: '  ', note: '' })).ok).toBe(
      true,
    );
    expect((await repo.search({ limit: 10 })).spots[0]).toMatchObject({
      name: undefined,
      note: undefined,
    });
    const long = await addSpot(deps, platform, { location: where, note: 'x'.repeat(281) });
    expect(long).toEqual({ ok: false, error: { tag: 'InvalidNote', reason: 'too_long' } });
  });

  it('is for WagonWise staff only', async () => {
    const { deps, repo } = setup();
    expect(await addSpot(deps, fleet, { location: where })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await repo.search({ limit: 10 })).total).toBe(0);
  });
});

describe('the kind of spot', () => {
  it('is a parking spot unless staff say it is a lay-by', async () => {
    const { deps, repo } = setup();
    await addSpot(deps, platform, { location: where });
    await addSpot(deps, platform, { location: { lat: 50.8, lon: -3.5 }, kind: 'layby' });
    const kinds = (await repo.search({ limit: 10 })).spots.map((s) => s.kind).sort();
    expect(kinds).toEqual(['layby', 'parking']);
  });
});

describe('updateSpot and deleteSpot', () => {
  it('changes the details of any spot but keeps where it came from', async () => {
    const { deps, repo } = setup();
    const driverSpot = {
      id: makeId<'SafeParkingSpotId'>('s1'),
      reporterId: makeId<'DriverId'>('d1'),
      source: 'driver' as const,
      location: where,
      note: 'layby',
      reportedAt: new Date('2026-10-01T00:00:00.000Z'),
    };
    await repo.save(driverSpot);
    const result = await updateSpot(deps, platform, driverSpot.id, {
      location: where,
      name: 'A38 layby',
      toilets: false,
    });
    expect(result.ok).toBe(true);
    expect(await repo.find(driverSpot.id)).toMatchObject({
      source: 'driver',
      reporterId: 'd1',
      name: 'A38 layby',
      toilets: false,
      note: undefined,
    });
  });

  it('says not found for a spot that is not there, and refuses a company', async () => {
    const { deps } = setup();
    const id = makeId<'SafeParkingSpotId'>('nope');
    expect(await updateSpot(deps, platform, id, { location: where })).toEqual({
      ok: false,
      error: { tag: 'SafeParkingSpotNotFound' },
    });
    expect(await updateSpot(deps, fleet, id, { location: where })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deleteSpot(deps, platform, id)).toEqual({
      ok: false,
      error: { tag: 'SafeParkingSpotNotFound' },
    });
    expect(await deleteSpot(deps, fleet, id)).toEqual({ ok: false, error: { tag: 'Forbidden' } });
  });

  it('deletes any spot', async () => {
    const { deps, repo } = setup();
    const added = await addSpot(deps, platform, { location: where });
    if (!added.ok) throw new Error('add failed');
    expect(await deleteSpot(deps, platform, added.value.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect((await repo.search({ limit: 10 })).total).toBe(0);
  });
});

describe('listSpots', () => {
  it('lists with counts by source, for staff only', async () => {
    const { deps } = setup();
    await addSpot(deps, platform, { location: where, name: 'One' });
    const listed = await listSpots(deps, platform, { limit: 10 });
    expect(listed.ok && listed.value.total).toBe(1);
    expect(listed.ok && listed.value.bySource).toEqual({ driver: 0, admin: 1, osm: 0 });
    expect(await listSpots(deps, fleet, { limit: 10 })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});
