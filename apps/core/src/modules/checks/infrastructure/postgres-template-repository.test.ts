import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { CheckTemplate } from '../domain/check-template.js';
import type { UntypedDb } from './db.js';
import { PostgresTemplateRepository } from './postgres-template-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const van = makeId<'FleetVehicleId'>('a0000000-0000-4000-8000-000000000001');

let n = 0;
function template(overrides: Partial<CheckTemplate> = {}): CheckTemplate {
  n += 1;
  return {
    id: makeId<'CheckTemplateId'>(`c000000${n}-0000-4000-8000-00000000000${n}`),
    companyId: acme,
    name: `List ${n}`,
    appliesTo: 'selected',
    vehicleIds: [van],
    items: [
      {
        id: 'tyres',
        kind: 'pass_fail',
        label: 'Tyres',
        help: 'Tread and damage',
        required: true,
        severity: 'do_not_drive',
        photoOnDefect: true,
      },
      {
        id: 'psi',
        kind: 'number',
        label: 'Pressure',
        required: false,
        unit: 'psi',
        min: 80,
        max: 120,
        severity: 'advisory',
      },
      { id: 'note', kind: 'note', label: 'Anything else?', required: false },
    ],
    version: 1,
    archivedAt: undefined,
    createdAt: new Date('2026-10-09T09:00:00.000Z'),
    updatedAt: new Date('2026-10-09T09:00:00.000Z'),
    ...overrides,
  };
}

describe('PostgresTemplateRepository', () => {
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

  const repo = () => new PostgresTemplateRepository(db);

  it('round-trips a list whole: every kind of question, its limits, and the vehicles it covers', async () => {
    const t = template();
    await repo().save(t);
    expect(await repo().findById(t.id)).toEqual(t);
  });

  it('replaces a list on save, keeping its id and raising its version', async () => {
    const t = template();
    await repo().save(t);
    const changed = { ...t, name: 'Renamed', version: 2, items: t.items.slice(0, 1) };
    await repo().save(changed);
    const found = await repo().findById(t.id);
    expect(found).toMatchObject({ name: 'Renamed', version: 2 });
    expect(found?.items).toHaveLength(1);
  });

  it('lists a company’s lists A to Z, without archived ones or other companies’', async () => {
    const b = template({ name: 'B list' });
    const a = template({ name: 'A list' });
    const gone = template({ name: 'Gone', archivedAt: new Date('2026-10-10T09:00:00.000Z') });
    const theirs = template({ name: 'Theirs', companyId: beta });
    for (const t of [b, a, gone, theirs]) await repo().save(t);
    const names = (await repo().listForCompany(acme)).map((t) => t.name);
    expect(names).toContain('A list');
    expect(names.indexOf('A list')).toBeLessThan(names.indexOf('B list'));
    expect(names).not.toContain('Gone');
    expect(names).not.toContain('Theirs');
  });

  it('still finds an archived list by id, because past checks refer to it', async () => {
    const t = template({ archivedAt: new Date('2026-10-10T09:00:00.000Z') });
    await repo().save(t);
    expect((await repo().findById(t.id))?.archivedAt).toEqual(t.archivedAt);
  });
});
