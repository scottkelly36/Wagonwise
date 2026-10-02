import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'kysely';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { DriverLink } from '../domain/driver-link.js';
import type { UntypedDb } from './db.js';
import { PostgresCompanyCodeRepository } from './postgres-company-code-repository.js';
import { PostgresDriverLinkRepository } from './postgres-driver-link-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const pat = makeId<'DriverId'>('aaaaaaaa-0000-4000-8000-000000000001');
const t = new Date('2026-10-02T09:00:00.000Z');

describe('Postgres driver links and company codes', () => {
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

  const links = () => new PostgresDriverLinkRepository(db);
  const codes = () => new PostgresCompanyCodeRepository(db);

  const link = (n: number, overrides: Partial<DriverLink> = {}): DriverLink => ({
    id: makeId<'DriverLinkId'>(`b0000000-0000-4000-8000-00000000000${n}`),
    companyId: acme,
    status: 'invited',
    invitedIdentifier: 'sam@example.com',
    createdAt: t,
    ...overrides,
  });

  it('round-trips an invitation and a request, with and without the optional fields', async () => {
    const invitation = link(1);
    const request = link(2, {
      status: 'requested',
      invitedIdentifier: undefined,
      driverId: pat,
      companyId: beta,
    });
    await links().save(invitation);
    await links().save(request);
    expect(await links().findById(invitation.id)).toEqual(invitation);
    expect(await links().findById(request.id)).toEqual(request);
    expect(
      await links().findById(makeId<'DriverLinkId'>('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });

  it('finds a live link and a pending invitation, and lists for a company and for a driver', async () => {
    expect((await links().findLive(beta, pat))?.status).toBe('requested');
    expect(await links().findLive(acme, pat)).toBeNull();
    expect((await links().findPendingInvite(acme, 'sam@example.com'))?.id).toBe(link(1).id);
    expect(await links().findPendingInvite(acme, 'nobody@example.com')).toBeNull();

    expect((await links().listForCompany(acme)).map((l) => l.id)).toEqual([link(1).id]);
    const mine = await links().listForDriver(pat, 'pat@example.com');
    expect(mine.map((l) => l.id)).toEqual([link(2).id]);
    const forSam = await links().listForDriver(
      makeId<'DriverId'>('cccccccc-0000-4000-8000-000000000009'),
      'sam@example.com',
    );
    expect(forSam.map((l) => l.id)).toEqual([link(1).id]);
  });

  it('updates a link in place and writes its events to the outbox', async () => {
    const accepted: DriverLink = { ...link(1), status: 'active', driverId: pat, decidedAt: t };
    await links().save(accepted, [
      {
        eventId: 'dddddddd-0000-4000-8000-000000000001',
        aggregateType: 'DriverLink',
        aggregateId: accepted.id,
        eventType: 'DriverJoinedFleet',
        payload: { linkId: accepted.id },
      },
    ]);
    expect(await links().findById(accepted.id)).toEqual(accepted);
    const { rows } = await sql<{ event_type: string }>`
      select event_type from outbox.events where aggregate_id = ${accepted.id}
    `.execute(db);
    expect(rows).toEqual([{ event_type: 'DriverJoinedFleet' }]);
  });

  it('refuses a second live link for the same company and driver', async () => {
    await expect(
      links().save(link(3, { status: 'requested', invitedIdentifier: undefined, driverId: pat })),
    ).rejects.toThrow(/driver_links_live_driver_idx/);
  });

  it('keeps one code per company, replaced on regenerate, and resolves an exact code', async () => {
    expect(await codes().findByCompany(acme)).toBeNull();
    await codes().save(acme, 'ABCD2345', t);
    await codes().save(beta, 'WXYZ6789', t);
    expect(await codes().findByCompany(acme)).toBe('ABCD2345');
    expect(await codes().findCompanyByCode('WXYZ6789')).toBe(beta);

    await codes().save(acme, 'MNPQ2222', t);
    expect(await codes().findByCompany(acme)).toBe('MNPQ2222');
    expect(await codes().findCompanyByCode('ABCD2345')).toBeNull();
    expect(await codes().findCompanyByCode('NOPE2345')).toBeNull();
  });
});
