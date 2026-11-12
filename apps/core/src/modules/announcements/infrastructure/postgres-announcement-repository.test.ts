import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { applySchema } from '../../identity/infrastructure/testing/apply-schema.js';
import { createDb, createPool } from '../../identity/infrastructure/testing/db-for-tests.js';
import type { Announcement } from '../domain/announcement.js';
import {
  PostgresAnnouncementRepository,
  PostgresPushPreferences,
  type UntypedDb,
} from './postgres-announcement-repository.js';

/** A real PostGIS container with the real migrations applied, as for the other repositories: proves the SQL and the row mapping, which fakes cannot. */
describe('announcements Postgres repositories', () => {
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

  const note = (id: string, publishedAt: string, title = 'A note'): Announcement => ({
    id: makeId<'AnnouncementId'>(id),
    title,
    body: 'First point\nSecond point',
    publishedAt: new Date(publishedAt),
    publishedBy: 'staff-1',
  });

  describe('PostgresAnnouncementRepository', () => {
    const repo = () => new PostgresAnnouncementRepository(db);
    const A = '11111111-1111-4111-8111-111111111111';
    const B = '22222222-2222-4222-8222-222222222222';

    it('round-trips a note, newest first, and finds the latest', async () => {
      await repo().insert(note(A, '2026-11-10T09:00:00.000Z', 'Older'));
      await repo().insert(note(B, '2026-11-12T09:00:00.000Z', 'Newer'));

      const listed = await repo().listNewest(10);
      expect(listed.map((a) => a.title)).toEqual(['Newer', 'Older']);
      expect(listed[0]).toEqual(note(B, '2026-11-12T09:00:00.000Z', 'Newer'));
      expect((await repo().findLatest())?.title).toBe('Newer');
      expect(await repo().listNewest(1)).toHaveLength(1);
    });

    it('has no push time until one is recorded, then keeps the latest and how many phones took it', async () => {
      expect(await repo().lastPushAt()).toBeNull();

      await repo().recordPush(makeId<'AnnouncementId'>(A), new Date('2026-11-10T09:05:00.000Z'), 7);
      expect(await repo().lastPushAt()).toEqual(new Date('2026-11-10T09:05:00.000Z'));

      await repo().recordPush(makeId<'AnnouncementId'>(B), new Date('2026-11-12T09:05:00.000Z'), 0);
      expect(await repo().lastPushAt()).toEqual(new Date('2026-11-12T09:05:00.000Z'));

      const listed = await repo().listNewest(10);
      expect(listed[0]).toMatchObject({
        pushedTo: 0,
        pushedAt: new Date('2026-11-12T09:05:00.000Z'),
      });
      expect(listed[1]).toMatchObject({ pushedTo: 7 });
    });

    it('removes one, and says when there was none', async () => {
      expect(await repo().delete(makeId<'AnnouncementId'>(B))).toBe(true);
      expect(await repo().delete(makeId<'AnnouncementId'>(B))).toBe(false);
      expect((await repo().findLatest())?.title).toBe('Older');
    });
  });

  describe('PostgresPushPreferences', () => {
    const prefs = () => new PostgresPushPreferences(db);
    const D1 = '33333333-3333-4333-8333-333333333333';
    const D2 = '44444444-4444-4444-8444-444444444444';
    const at = new Date('2026-11-12T09:00:00.000Z');

    it('is on until a driver turns it off, can be turned off twice, and back on', async () => {
      expect(await prefs().isOptedOut(D1)).toBe(false);

      await prefs().setOptedOut(D1, true, at);
      await prefs().setOptedOut(D1, true, at);
      await prefs().setOptedOut(D2, true, at);
      expect(await prefs().isOptedOut(D1)).toBe(true);
      expect(await prefs().listOptedOut()).toEqual(new Set([D1, D2]));

      await prefs().setOptedOut(D1, false, at);
      expect(await prefs().isOptedOut(D1)).toBe(false);
      expect(await prefs().listOptedOut()).toEqual(new Set([D2]));
    });

    it('is erased with a deleted account, and erasing twice is harmless', async () => {
      await prefs().erase(D2);
      await prefs().erase(D2);
      expect(await prefs().listOptedOut()).toEqual(new Set());
    });
  });
});
