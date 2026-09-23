import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { FeedbackNote } from '../domain/feedback-note.js';
import type { UntypedDb } from './db.js';
import { PostgresFeedbackNoteRepository } from './postgres-feedback-note-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

describe('PostgresFeedbackNoteRepository', () => {
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

  function note(overrides: Partial<FeedbackNote> = {}): FeedbackNote {
    return {
      id: makeId<'FeedbackNoteId'>('11111111-1111-4111-8111-111111111111'),
      driverId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
      message: 'The route to Corbridge avoided a bridge that was fine.',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
      createdAt: new Date('2026-06-15T08:00:00.000Z'),
      ...overrides,
    };
  }

  it('inserts a note that lands in the real table with every field intact', async () => {
    const n = note();
    await new PostgresFeedbackNoteRepository(db).save(n);

    const { rows } = await pool.query<{
      id: string;
      driver_id: string;
      message: string;
      app_version: string;
      device_info: string;
      created_at: Date;
    }>(
      'select id, driver_id, message, app_version, device_info, created_at from feedback.notes where id = $1',
      [n.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: n.id,
      driver_id: n.driverId,
      message: n.message,
      app_version: n.appVersion,
      device_info: n.deviceInfo,
    });
    expect(rows[0]?.created_at).toEqual(n.createdAt);
  });
});
