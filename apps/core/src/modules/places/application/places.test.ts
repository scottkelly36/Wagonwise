import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { CompanyId, DriverId, SavedPlaceId } from '../domain/place.js';
import type { PlaceActor } from './authorization.js';
import {
  deletePlace,
  listPlaces,
  listReportedPlaces,
  markPlace,
  moderatePlace,
  placesNear,
  publicPlacesNear,
  reportPlace,
  setPlaceVisibility,
  sharePlace,
  updatePlace,
} from './places.js';
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

describe('sharePlace (a solo driver who has joined a company)', () => {
  const solo = makeId<'DriverId'>('driver-solo');

  it('moves a personal place into the company, for everyone there to see', async () => {
    const { deps } = setup();
    // The solo driver has since joined acme: the membership fake says pat and sam do; use pat.
    await mark(deps, driver(pat), id(1), { companyId: undefined, name: 'Mine' });
    const result = await sharePlace(deps, { actor: driver(pat), id: id(1), companyId: acme });
    expect(result).toMatchObject({
      ok: true,
      value: { companyId: acme, name: 'Mine', createdBy: pat },
    });
    const colleague = await listPlaces(deps, { actor: driver(sam), companyId: acme });
    expect(colleague.ok && colleague.value.map((p) => p.name)).toEqual(['Mine']);
    const mine = await listPlaces(deps, { actor: driver(pat), companyId: undefined });
    expect(mine.ok && mine.value).toEqual([]);
  });

  it('refuses a company the driver does not belong to', async () => {
    const { deps } = setup();
    await mark(deps, driver(pat), id(1), { companyId: undefined });
    expect(await sharePlace(deps, { actor: driver(pat), id: id(1), companyId: beta })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('is only for the owner’s personal places: not someone else’s, not one already a company’s, not staff', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined });
    await mark(deps, driver(pat), id(2)); // already acme's
    for (const [actor, placeId] of [
      [driver(pat), id(1)],
      [driver(pat), id(2)],
      [dispatcher, id(1)],
      [admin, id(1)],
    ] as const) {
      expect(await sharePlace(deps, { actor, id: placeId, companyId: acme })).toEqual({
        ok: false,
        error: { tag: 'PlaceNotFound' },
      });
    }
  });
});

describe('public places', () => {
  const solo = makeId<'DriverId'>('driver-solo');
  const here = { lat: 54.95, lon: -2.2 };

  it('lets the owner make a personal place public and private again, and others near it find it', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined });
    expect(
      await publicPlacesNear(deps, { actor: driver(lee), location: here, radiusM: 1000 }),
    ).toEqual({
      ok: true,
      value: [],
    });

    const made = await setPlaceVisibility(deps, { actor: driver(solo), id: id(1), isPublic: true });
    expect(made).toMatchObject({ ok: true, value: { isPublic: true } });
    const seen = await publicPlacesNear(deps, {
      actor: driver(lee),
      location: here,
      radiusM: 1000,
    });
    expect(seen.ok && seen.value.map((p) => p.id)).toEqual([id(1)]);

    await setPlaceVisibility(deps, { actor: driver(solo), id: id(1), isPublic: false });
    const gone = await publicPlacesNear(deps, {
      actor: driver(lee),
      location: here,
      radiusM: 1000,
    });
    expect(gone.ok && gone.value).toEqual([]);
  });

  it('is only the owner’s to change, and never a company’s place', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined });
    await mark(deps, driver(pat), id(2)); // acme's
    for (const [actor, placeId] of [
      [driver(lee), id(1)],
      [driver(pat), id(2)],
      [dispatcher, id(2)],
      [admin, id(1)],
      [driver(solo), id(99)],
    ] as const) {
      expect(await setPlaceVisibility(deps, { actor, id: placeId, isPublic: true })).toEqual({
        ok: false,
        error: { tag: 'PlaceNotFound' },
      });
    }
  });

  it('is for drivers: staff get nothing', async () => {
    const { deps } = setup();
    expect(
      await publicPlacesNear(deps, { actor: dispatcher, location: here, radiusM: 1000 }),
    ).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('lets another driver report a public place, but not their own, a private one, or as staff', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined });
    // Private: not theirs to see, so not theirs to report.
    expect(await reportPlace(deps, { actor: driver(lee), id: id(1), reason: 'other' })).toEqual({
      ok: false,
      error: { tag: 'PlaceNotFound' },
    });
    await setPlaceVisibility(deps, { actor: driver(solo), id: id(1), isPublic: true });
    expect(await reportPlace(deps, { actor: driver(solo), id: id(1), reason: 'other' })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await reportPlace(deps, { actor: admin, id: id(1), reason: 'other' })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(
      await reportPlace(deps, { actor: driver(lee), id: id(1), reason: 'wrong_place' }),
    ).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('stops showing a public place to others once three different drivers have reported it', async () => {
    const { deps } = setup();
    await mark(deps, driver(solo), id(1), { companyId: undefined });
    await setPlaceVisibility(deps, { actor: driver(solo), id: id(1), isPublic: true });
    const reporters = ['a', 'b', 'c'].map((n) => makeId<'DriverId'>(`driver-${n}`));
    for (const reporter of reporters.slice(0, 2)) {
      await reportPlace(deps, { actor: driver(reporter), id: id(1), reason: 'other' });
    }
    const before = await publicPlacesNear(deps, {
      actor: driver(lee),
      location: here,
      radiusM: 1000,
    });
    expect(before.ok && before.value).toHaveLength(1);
    await reportPlace(deps, { actor: driver(reporters[2]!), id: id(1), reason: 'other' });
    const after = await publicPlacesNear(deps, {
      actor: driver(lee),
      location: here,
      radiusM: 1000,
    });
    expect(after.ok && after.value).toEqual([]);
  });

  it('is no longer public once shared with a company', async () => {
    const { deps } = setup();
    await mark(deps, driver(pat), id(1), { companyId: undefined });
    await setPlaceVisibility(deps, { actor: driver(pat), id: id(1), isPublic: true });
    await sharePlace(deps, { actor: driver(pat), id: id(1), companyId: acme });
    const seen = await publicPlacesNear(deps, {
      actor: driver(lee),
      location: here,
      radiusM: 1000,
    });
    expect(seen.ok && seen.value).toEqual([]);
  });
});

describe('reviewing reported places', () => {
  const solo = makeId<'DriverId'>('driver-solo');
  const here = { lat: 54.95, lon: -2.2 };
  const reporters = ['a', 'b', 'c'].map((n) => makeId<'DriverId'>(`driver-${n}`));

  async function publicPlace(deps: ReturnType<typeof setup>['deps'], placeId: SavedPlaceId) {
    await mark(deps, driver(solo), placeId, { companyId: undefined });
    await setPlaceVisibility(deps, { actor: driver(solo), id: placeId, isPublic: true });
  }

  it('lists reported public places, most reported first, saying which are hidden, for WagonWise staff only', async () => {
    const { deps } = setup();
    await publicPlace(deps, id(1));
    await publicPlace(deps, id(2));
    await publicPlace(deps, id(3)); // never reported
    await reportPlace(deps, { actor: driver(reporters[0]!), id: id(1), reason: 'wrong_place' });
    for (const [n, reporter] of reporters.entries()) {
      await reportPlace(deps, {
        actor: driver(reporter),
        id: id(2),
        reason: n === 0 ? 'offensive' : 'other',
      });
    }

    const listed = await listReportedPlaces(deps, { actor: admin });
    expect(listed.ok && listed.value.map((r) => [r.place.id, r.reportCount, r.hidden])).toEqual([
      [id(2), 3, true],
      [id(1), 1, false],
    ]);
    expect(listed.ok && listed.value[0]?.reasons).toEqual(
      expect.arrayContaining([
        { reason: 'offensive', count: 1 },
        { reason: 'other', count: 2 },
      ]),
    );
    for (const actor of [driver(solo), dispatcher, viewer]) {
      expect(await listReportedPlaces(deps, { actor })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });

  it('keeping a place clears its reports, so a hidden one shows again', async () => {
    const { deps } = setup();
    await publicPlace(deps, id(1));
    for (const reporter of reporters) {
      await reportPlace(deps, { actor: driver(reporter), id: id(1), reason: 'other' });
    }
    expect(
      await publicPlacesNear(deps, { actor: driver(lee), location: here, radiusM: 1000 }),
    ).toEqual({ ok: true, value: [] });

    expect(await moderatePlace(deps, { actor: admin, id: id(1), decision: 'keep' })).toEqual({
      ok: true,
      value: undefined,
    });
    const seen = await publicPlacesNear(deps, {
      actor: driver(lee),
      location: here,
      radiusM: 1000,
    });
    expect(seen.ok && seen.value.map((p) => p.id)).toEqual([id(1)]);
    const listed = await listReportedPlaces(deps, { actor: admin });
    expect(listed.ok && listed.value).toEqual([]);
  });

  it('making a place private takes it off the public map but leaves it with its owner', async () => {
    const { deps } = setup();
    await publicPlace(deps, id(1));
    await reportPlace(deps, { actor: driver(reporters[0]!), id: id(1), reason: 'offensive' });

    expect(
      await moderatePlace(deps, { actor: admin, id: id(1), decision: 'make_private' }),
    ).toEqual({
      ok: true,
      value: undefined,
    });
    const seen = await publicPlacesNear(deps, {
      actor: driver(lee),
      location: here,
      radiusM: 1000,
    });
    expect(seen.ok && seen.value).toEqual([]);
    const mine = await listPlaces(deps, { actor: driver(solo), companyId: undefined });
    expect(mine.ok && mine.value.map((p) => [p.id, p.isPublic])).toEqual([[id(1), false]]);
  });

  it('refuses anyone but WagonWise staff, and a place that is not public', async () => {
    const { deps } = setup();
    await publicPlace(deps, id(1));
    await mark(deps, driver(solo), id(2), { companyId: undefined }); // private
    for (const actor of [driver(solo), dispatcher]) {
      expect(await moderatePlace(deps, { actor, id: id(1), decision: 'keep' })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    for (const placeId of [id(2), id(99)]) {
      expect(await moderatePlace(deps, { actor: admin, id: placeId, decision: 'keep' })).toEqual({
        ok: false,
        error: { tag: 'PlaceNotFound' },
      });
    }
  });
});
