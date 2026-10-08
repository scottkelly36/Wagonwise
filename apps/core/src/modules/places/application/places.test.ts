import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { CompanyId, DriverId, SavedPlaceId } from '../domain/place.js';
import type { PlaceActor } from './authorization.js';
import { deletePlace, listPlaces, markPlace, placesNear, updatePlace } from './places.js';
import type { DriverMembership } from './ports/directories.js';
import { InMemoryPlaceRepository } from './testing/in-memory-place-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const pat = makeId<'DriverId'>('driver-pat');
const sam = makeId<'DriverId'>('driver-sam'); // drives for acme too
const lee = makeId<'DriverId'>('driver-lee'); // drives for beta
const id = (n: number) => makeId<'SavedPlaceId'>(`place-${n}`);

const membership: DriverMembership = {
  isActiveDriverOfCompany: (driver: DriverId, company: CompanyId) =>
    Promise.resolve(
      (company === acme && (driver === pat || driver === sam)) ||
        (company === beta && driver === lee),
    ),
};

const driver = (driverId: DriverId): PlaceActor => ({ kind: 'driver', driverId });
const dispatcher: PlaceActor = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const viewer: PlaceActor = { kind: 'fleet', companyId: acme, privileges: [] };
const otherDispatcher: PlaceActor = { kind: 'fleet', companyId: beta, privileges: ['dispatch'] };
const admin: PlaceActor = { kind: 'platform' };

function setup() {
  const repo = new InMemoryPlaceRepository();
  const clock = new FakeClock('2026-10-08T10:00:00.000Z');
  return { deps: { repo, membership, clock }, repo, clock };
}

const farmGate = { lat: 54.95, lon: -2.2 };

async function mark(
  deps: ReturnType<typeof setup>['deps'],
  actor: PlaceActor,
  placeId: SavedPlaceId,
  overrides: Partial<Parameters<typeof markPlace>[1]> = {},
) {
  return markPlace(deps, {
    actor,
    id: placeId,
    companyId: acme,
    category: 'farm',
    name: 'Smith’s Farm',
    note: 'Gate on the left, tight turn',
    location: farmGate,
    ...overrides,
  });
}

describe('markPlace', () => {
  it('lets a driver of the company mark a place, remembering who and when', async () => {
    const { deps } = setup();
    const result = await mark(deps, driver(pat), id(1));
    expect(result).toMatchObject({
      ok: true,
      value: {
        companyId: acme,
        category: 'farm',
        name: 'Smith’s Farm',
        note: 'Gate on the left, tight turn',
        createdBy: pat,
        location: farmGate,
      },
    });
  });

  it('trims the name, and treats a blank note as no note', async () => {
    const { deps } = setup();
    const result = await mark(deps, driver(pat), id(1), { name: '  Smith Farm  ', note: '   ' });
    expect(result).toMatchObject({ ok: true, value: { name: 'Smith Farm', note: undefined } });
  });

  it('refuses an empty or over-long name and an over-long note', async () => {
    const { deps } = setup();
    expect(await mark(deps, driver(pat), id(1), { name: '   ' })).toEqual({
      ok: false,
      error: { tag: 'InvalidName', reason: 'empty' },
    });
    expect(await mark(deps, driver(pat), id(1), { name: 'x'.repeat(81) })).toMatchObject({
      ok: false,
      error: { tag: 'InvalidName', reason: 'too_long' },
    });
    expect(await mark(deps, driver(pat), id(1), { note: 'x'.repeat(501) })).toMatchObject({
      ok: false,
      error: { tag: 'InvalidPlaceNote' },
    });
  });

  it('refuses a driver of another company, a viewer without dispatch, and another company’s staff', async () => {
    const { deps } = setup();
    for (const actor of [driver(lee), viewer, otherDispatcher]) {
      expect(await mark(deps, actor, id(1))).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    }
  });

  it('lets a dispatcher and a WagonWise admin mark one', async () => {
    const { deps } = setup();
    expect((await mark(deps, dispatcher, id(1))).ok).toBe(true);
    expect((await mark(deps, admin, id(2))).ok).toBe(true);
  });

  it('treats the same id again as a retry: one place, the first one returned', async () => {
    const { deps, repo } = setup();
    await mark(deps, driver(pat), id(1), { name: 'First' });
    const again = await mark(deps, driver(pat), id(1), { name: 'Second' });
    expect(again).toMatchObject({ ok: true, value: { name: 'First' } });
    expect(await repo.listForCompany(acme)).toHaveLength(1);
  });

  it('will not hand back a place of another company that shares the id', async () => {
    const { deps } = setup();
    await mark(deps, driver(lee), id(1), { companyId: beta });
    expect(await mark(deps, driver(pat), id(1))).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('listing and finding near', () => {
  it('lists the company’s places to its drivers and staff, never another company’s', async () => {
    const { deps } = setup();
    await mark(deps, driver(pat), id(1), { name: 'B farm' });
    await mark(deps, driver(pat), id(2), { name: 'A farm' });
    await mark(deps, driver(lee), id(3), { companyId: beta, name: 'Beta farm' });

    for (const actor of [driver(sam), viewer, dispatcher, admin]) {
      const result = await listPlaces(deps, { actor, companyId: acme });
      if (!result.ok) throw new Error('expected a list');
      expect(result.value.map((p) => p.name)).toEqual(['A farm', 'B farm']);
    }
    for (const actor of [driver(lee), otherDispatcher]) {
      expect(await listPlaces(deps, { actor, companyId: acme })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });

  it('finds the company’s places within a distance, nearest first', async () => {
    const { deps } = setup();
    await mark(deps, driver(pat), id(1), { name: 'Far', location: { lat: 54.97, lon: -2.2 } });
    await mark(deps, driver(pat), id(2), { name: 'Near', location: { lat: 54.9505, lon: -2.2 } });
    await mark(deps, driver(pat), id(3), {
      name: 'Out of range',
      location: { lat: 55.5, lon: -2.2 },
    });

    const result = await placesNear(deps, {
      actor: driver(sam),
      companyId: acme,
      location: farmGate,
      radiusM: 5000,
    });
    if (!result.ok) throw new Error('expected places');
    expect(result.value.map((p) => p.name)).toEqual(['Near', 'Far']);
  });
});

describe('updatePlace', () => {
  it('lets any driver of the company improve the note, and keeps the spot', async () => {
    const { deps, clock } = setup();
    await mark(deps, driver(pat), id(1));
    clock.advance(60_000);
    const result = await updatePlace(deps, {
      actor: driver(sam),
      id: id(1),
      note: 'Ask for Jim at the house; gate code 4411',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        note: 'Ask for Jim at the house; gate code 4411',
        location: farmGate,
        createdBy: pat,
      },
    });
    if (result.ok)
      expect(result.value.updatedAt.getTime()).toBeGreaterThan(result.value.createdAt.getTime());
  });

  it('clears a note with an empty string, and leaves it alone when not mentioned', async () => {
    const { deps } = setup();
    await mark(deps, driver(pat), id(1));
    expect(
      await updatePlace(deps, { actor: driver(pat), id: id(1), name: 'Renamed' }),
    ).toMatchObject({
      ok: true,
      value: { name: 'Renamed', note: 'Gate on the left, tight turn' },
    });
    expect(await updatePlace(deps, { actor: driver(pat), id: id(1), note: '' })).toMatchObject({
      ok: true,
      value: { note: undefined },
    });
  });

  it('answers not found to another company, forbidden to a viewer who can see it', async () => {
    const { deps } = setup();
    await mark(deps, driver(pat), id(1));
    expect(await updatePlace(deps, { actor: driver(lee), id: id(1), note: 'x' })).toEqual({
      ok: false,
      error: { tag: 'PlaceNotFound' },
    });
    expect(await updatePlace(deps, { actor: viewer, id: id(1), note: 'x' })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await updatePlace(deps, { actor: driver(pat), id: id(99), note: 'x' })).toEqual({
      ok: false,
      error: { tag: 'PlaceNotFound' },
    });
  });
});

describe('deletePlace', () => {
  it('lets the driver who marked it take it back (Undo), and a dispatcher or admin remove any', async () => {
    const { deps, repo } = setup();
    await mark(deps, driver(pat), id(1));
    expect(await deletePlace(deps, { actor: driver(pat), id: id(1) })).toEqual({
      ok: true,
      value: undefined,
    });
    await mark(deps, driver(pat), id(2));
    expect((await deletePlace(deps, { actor: dispatcher, id: id(2) })).ok).toBe(true);
    await mark(deps, driver(pat), id(3));
    expect((await deletePlace(deps, { actor: admin, id: id(3) })).ok).toBe(true);
    expect(await repo.listForCompany(acme)).toEqual([]);
  });

  it('does not let a colleague, a viewer or another company delete it', async () => {
    const { deps, repo } = setup();
    await mark(deps, driver(pat), id(1));
    expect(await deletePlace(deps, { actor: driver(sam), id: id(1) })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deletePlace(deps, { actor: viewer, id: id(1) })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deletePlace(deps, { actor: driver(lee), id: id(1) })).toEqual({
      ok: false,
      error: { tag: 'PlaceNotFound' },
    });
    expect(await repo.listForCompany(acme)).toHaveLength(1);
  });
});

describe('personal places (a driver with no company)', () => {
  const solo = makeId<'DriverId'>('driver-solo');
  const other = makeId<'DriverId'>('driver-other');

  it('lets a driver mark a place with no company, which only they can see, edit and delete', async () => {
    const { deps } = setup();
    const marked = await mark(deps, driver(solo), id(1), { companyId: undefined });
    expect(marked).toMatchObject({ ok: true, value: { companyId: undefined, createdBy: solo } });

    const mine = await listPlaces(deps, { actor: driver(solo), companyId: undefined });
    expect(mine.ok && mine.value.map((p) => p.name)).toEqual(['Smith’s Farm']);
    const theirs = await listPlaces(deps, { actor: driver(other), companyId: undefined });
    expect(theirs.ok && theirs.value).toEqual([]);

    expect(await updatePlace(deps, { actor: driver(other), id: id(1), note: 'x' })).toEqual({
      ok: false,
      error: { tag: 'PlaceNotFound' },
    });
    expect(
      await updatePlace(deps, { actor: driver(solo), id: id(1), note: 'Side gate' }),
    ).toMatchObject({
      ok: true,
      value: { note: 'Side gate' },
    });
    expect(await deletePlace(deps, { actor: driver(other), id: id(1) })).toEqual({
      ok: false,
      error: { tag: 'PlaceNotFound' },
    });
    expect((await deletePlace(deps, { actor: driver(solo), id: id(1) })).ok).toBe(true);
  });

  it('finds only the driver’s own personal places near a point, never a company’s', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined, name: 'Mine' });
    await mark(deps, driver(pat), id(2), { name: 'Company farm' }); // acme, same spot
    const result = await placesNear(deps, {
      actor: driver(solo),
      companyId: undefined,
      location: farmGate,
      radiusM: 1000,
    });
    expect(result.ok && result.value.map((p) => p.name)).toEqual(['Mine']);
  });

  it('is not offered to staff, whoever they are', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined });
    for (const actor of [dispatcher, viewer, admin]) {
      expect(await listPlaces(deps, { actor, companyId: undefined })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
      expect(await mark(deps, actor, id(9), { companyId: undefined })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
      expect(await deletePlace(deps, { actor, id: id(1) })).toEqual({
        ok: false,
        error: { tag: 'PlaceNotFound' },
      });
    }
  });

  it('treats the same id again as a retry for the same driver, not for another', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined, name: 'First' });
    expect(
      await mark(deps, driver(solo), id(1), { companyId: undefined, name: 'Second' }),
    ).toMatchObject({
      ok: true,
      value: { name: 'First' },
    });
    expect(await mark(deps, driver(other), id(1), { companyId: undefined })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});
