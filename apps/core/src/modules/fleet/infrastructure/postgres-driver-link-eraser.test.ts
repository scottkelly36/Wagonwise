import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UntypedDb } from './db.js';
import { PostgresDriverLinkEraser } from './postgres-driver-link-eraser.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const PAT = 'aaaaaaaa-0000-4000-8000-000000000001';
const SAM = 'aaaaaaaa-0000-4000-8000-000000000002';
const at = new Date('2026-10-07T12:00:00.000Z');

describe('PostgresDriverLinkEraser', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
    await pool.query(`
      insert into fleet.driver_links
        (id, company_id, driver_id, invited_identifier, status, created_at, decided_at)
      values
        ('a1000000-0000-4000-8000-000000000001', '${ACME}', '${PAT}', 'pat@example.com', 'active', now(), now()),
        ('a1000000-0000-4000-8000-000000000002', '${BETA}', '${PAT}', null, 'declined', now(), '2026-09-01T00:00:00Z'),
        ('a1000000-0000-4000-8000-000000000003', '${BETA}', null, 'pat@example.com', 'invited', now(), null),
        ('a1000000-0000-4000-8000-000000000004', '${ACME}', null, 'sam@example.com', 'invited', now(), null),
        ('a1000000-0000-4000-8000-000000000005', '${ACME}', '${SAM}', null, 'active', now(), now())
    `);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const links = async () =>
    (
      await pool.query<{
        id: string;
        driver_id: string | null;
        invited_identifier: string | null;
        status: string;
        decided_at: Date | null;
      }>(`select * from fleet.driver_links order by id`)
    ).rows;

  it('deletes unanswered invitations to the driver’s identifier, ends their live links and clears the identifier', async () => {
    await new PostgresDriverLinkEraser(db).erase(PAT, 'pat@example.com', at);

    const rows = await links();
    // The invitation made to Pat's address (no driver yet) is gone.
    expect(rows.map((r) => r.id)).not.toContain('a1000000-0000-4000-8000-000000000003');
    const live = rows.find((r) => r.id === 'a1000000-0000-4000-8000-000000000001');
    expect(live).toMatchObject({ driver_id: PAT, invited_identifier: null, status: 'left' });
    expect(live?.decided_at).toEqual(at);
    // A declined link stays as it was, history of what was decided.
    expect(rows.find((r) => r.id === 'a1000000-0000-4000-8000-000000000002')).toMatchObject({
      status: 'declined',
    });
  });

  it('leaves other drivers’ links and invitations alone', async () => {
    const rows = await links();
    expect(rows.find((r) => r.id === 'a1000000-0000-4000-8000-000000000004')).toMatchObject({
      invited_identifier: 'sam@example.com',
      status: 'invited',
    });
    expect(rows.find((r) => r.id === 'a1000000-0000-4000-8000-000000000005')).toMatchObject({
      driver_id: SAM,
      status: 'active',
    });
  });

  it('can be run again without changing anything', async () => {
    const before = await links();
    await new PostgresDriverLinkEraser(db).erase(PAT, 'pat@example.com', new Date('2026-10-08Z'));
    expect(await links()).toEqual(before);
  });
});
