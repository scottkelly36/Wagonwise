import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { SavedPlace } from '../domain/place.js';
import type { UntypedDb } from './db.js';
import { PostgresPlaceRepository } from './postgres-place-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');

function place(n: number, overrides: Partial<SavedPlace> = {}): SavedPlace {
  return {
    id: makeId<'SavedPlaceId'>(`a000000${n}-0000-4000-8000-00000000000${n}`),
    companyId: acme,
    category: 'farm',
    name: `Farm ${n}`,
    note: 'Gate on the left',
    location: { lat: 54.95, lon: -2.2 },
    createdBy: makeId<'DriverId'>('d0000000-0000-4000-8000-000000000001'),
    createdAt: new Date('2026-10-08T10:00:00.000Z'),
    updatedAt: new Date('2026-10-08T10:00:00.000Z'),
    ...overrides,
  };
}

describe('PostgresPlaceRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const repo = () => new PostgresPlaceRepository(db);

  it('round-trips a place, including the note, the spot and who marked it', async () => {
    const p = place(1);
    await repo().save(p);
    const found = await repo().findById(p.id);
    expect(found).toEqual(p);
    expect(found?.location.lat).toBeCloseTo(54.95, 6);
  });

  it('round-trips a place with no note and no marker', async () => {
    const p = place(2, { note: undefined, createdBy: undefined });
    await repo().save(p);
    expect(await repo().findById(p.id)).toEqual(p);
  });

  it('saving the same id again changes the name, category and note, not the spot', async () => {
    const p = place(3);
    await repo().save(p);
    await repo().save({
      ...p,
      name: 'Renamed',
      category: 'yard',
      note: undefined,
      location: { lat: 1, lon: 1 }, // must be ignored
      updatedAt: new Date('2026-10-09T10:00:00.000Z'),
    });
    const found = await repo().findById(p.id);
    expect(found).toMatchObject({ name: 'Renamed', category: 'yard', note: undefined });
    expect(found?.location.lat).toBeCloseTo(54.95, 6);
    expect(found?.updatedAt).toEqual(new Date('2026-10-09T10:00:00.000Z'));
    expect(found?.createdAt).toEqual(p.createdAt);
  });

  it('lists a company’s places by name, and only that company’s', async () => {
    await repo().save(place(4, { name: 'zzz Last' }));
    await repo().save(place(5, { companyId: beta, name: 'Beta only' }));
    const names = (await repo().listForCompany(acme)).map((p) => p.name);
    expect(names).not.toContain('Beta only');
    expect(names).toEqual(
      [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
    expect(names.at(-1)).toBe('zzz Last');
  });

  it('finds the company’s places near a point, nearest first', async () => {
    const near = place(6, { name: 'Near', location: { lat: 56.0, lon: -3.0 } });
    const far = place(7, { name: 'Far', location: { lat: 56.02, lon: -3.0 } });
    const outside = place(8, { name: 'Outside', location: { lat: 57.0, lon: -3.0 } });
    const otherCompany = place(9, {
      companyId: beta,
      name: 'Other',
      location: { lat: 56.0, lon: -3.0 },
    });
    for (const p of [far, near, outside, otherCompany]) await repo().save(p);

    const found = await repo().findNear(acme, { lat: 56.0005, lon: -3.0 }, 5000);
    expect(found.map((p) => p.name)).toEqual(['Near', 'Far']);
  });

  it('deletes a place, and deleting it again is harmless', async () => {
    const p = place(1, {
      id: makeId<'SavedPlaceId'>('a1111111-0000-4000-8000-000000000001'),
    });
    await repo().save(p);
    await repo().delete(p.id);
    expect(await repo().findById(p.id)).toBeNull();
    await expect(repo().delete(p.id)).resolves.toBeUndefined();
  });

  it('keeps a driver’s personal places apart from every company’s', async () => {
    const solo = makeId<'DriverId'>('d5000000-0000-4000-8000-000000000005');
    const mine = place(1, {
      id: makeId<'SavedPlaceId'>('a5555555-0000-4000-8000-000000000001'),
      companyId: undefined,
      createdBy: solo,
      name: 'My farm',
      location: { lat: 52.5, lon: -1.5 },
    });
    await repo().save(mine);
    expect(await repo().findById(mine.id)).toEqual(mine);
    expect((await repo().listForDriver(solo)).map((p) => p.name)).toEqual(['My farm']);
    expect(
      await repo().listForDriver(makeId<'DriverId'>('d6000000-0000-4000-8000-000000000006')),
    ).toEqual([]);
    expect((await repo().listForCompany(acme)).map((p) => p.name)).not.toContain('My farm');
    const near = await repo().findNearForDriver(solo, { lat: 52.5, lon: -1.5 }, 1000);
    expect(near.map((p) => p.name)).toEqual(['My farm']);
  });
});
