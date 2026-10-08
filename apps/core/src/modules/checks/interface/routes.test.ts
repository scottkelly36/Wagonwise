import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { StaffCaller } from '../application/ports/directories.js';
import { InMemoryCheckRepository } from '../application/testing/in-memory-check-repository.js';
import { InMemoryOfficeCheckRepository } from '../application/testing/in-memory-office-check-repository.js';
import { InMemorySettingsRepository } from '../application/testing/in-memory-settings-repository.js';
import { InMemoryTemplateRepository } from '../application/testing/in-memory-template-repository.js';
import { makeId } from '../../../shared/brand.js';
import { registerChecksRoutes } from './routes.js';

const ACME = '11111111-1111-4111-8111-111111111111';
const BETA = '22222222-2222-4222-8222-222222222222';
const LORRY = 'lorry-acme';
const STAFF_HEADER = 'x-test-staff-id';
const TEMPLATE = '33333333-3333-4333-8333-333333333333';

const staff: Record<string, StaffCaller> = {
  builder: { kind: 'fleet', companyId: makeId<'CompanyId'>(ACME), privileges: ['manage_fleet'] },
  viewer: { kind: 'fleet', companyId: makeId<'CompanyId'>(ACME), privileges: ['dispatch'] },
  outsider: { kind: 'fleet', companyId: makeId<'CompanyId'>(BETA), privileges: ['manage_fleet'] },
  admin: { kind: 'platform' },
};

function buildApp(): { app: FastifyInstance; scopes: RecordingDataScopes } {
  const scopes = new RecordingDataScopes();
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const id = request.headers[STAFF_HEADER];
    if (typeof id === 'string') request.staffId = id;
    done();
  });
  const templateRepo = new InMemoryTemplateRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  registerChecksRoutes(app, {
    rules: {
      settings: new InMemorySettingsRepository(),
      templates: templateRepo,
      checks: new InMemoryCheckRepository(),
      office: new InMemoryOfficeCheckRepository(),
      clock,
    },
    templates: {
      templates: templateRepo,
      vehicles: {
        belongsToCompany: (v, c) => Promise.resolve(v === LORRY && c === ACME),
        find: (v) =>
          Promise.resolve(
            v === LORRY ? { companyId: makeId<'CompanyId'>(ACME), name: 'Big Wagon' } : null,
          ),
      },
      ids: new SequentialIdGenerator(),
      clock,
    },
    callerDirectory: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
    dataScopes: scopes,
  });
  return { app, scopes };
}

const as = (id: string) => ({ headers: { [STAFF_HEADER]: id } });
const body = {
  id: TEMPLATE,
  name: 'Tractor unit',
  appliesTo: 'all',
  vehicleIds: [],
  items: [
    {
      id: 'tyres',
      kind: 'pass_fail',
      label: 'Tyres',
      required: true,
      severity: 'do_not_drive',
      photoOnDefect: true,
    },
    {
      id: 'miles',
      kind: 'number',
      label: 'Odometer',
      required: true,
      unit: 'miles',
      severity: 'advisory',
    },
  ],
};
const { id: _id, ...updateBody } = body;
const create = (app: FastifyInstance, who = 'builder') =>
  app.inject({
    method: 'POST',
    url: `/staff/checks/companies/${ACME}/templates`,
    payload: body,
    ...as(who),
  });

describe('/staff/checks', () => {
  it('201s a list built by a fleet manager, in their company’s data scope', async () => {
    const { app, scopes } = buildApp();
    const response = await create(app);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: TEMPLATE, name: 'Tractor unit', version: 1 });
    expect(scopes.used).toEqual([{ kind: 'company', companyId: ACME }]);
  });

  it('lists the company’s lists to any of its staff, and 403s another company’s', async () => {
    const { app } = buildApp();
    await create(app);
    const listed = await app.inject({
      method: 'GET',
      url: `/staff/checks/companies/${ACME}/templates`,
      ...as('viewer'),
    });
    expect(listed.json<{ templates: unknown[] }>().templates).toHaveLength(1);
    const other = await app.inject({
      method: 'GET',
      url: `/staff/checks/companies/${ACME}/templates`,
      ...as('outsider'),
    });
    expect(other.statusCode).toBe(403);
  });

  it('403s a viewer who tries to build, change or remove a list', async () => {
    const { app } = buildApp();
    expect((await create(app, 'viewer')).statusCode).toBe(403);
    await create(app);
    const put = await app.inject({
      method: 'PUT',
      url: `/staff/checks/templates/${TEMPLATE}`,
      payload: updateBody,
      ...as('viewer'),
    });
    expect(put.statusCode).toBe(403);
    const del = await app.inject({
      method: 'DELETE',
      url: `/staff/checks/templates/${TEMPLATE}`,
      ...as('viewer'),
    });
    expect(del.statusCode).toBe(403);
  });

  it('changes a list (version 2), then archives it with 204 so it is no longer listed', async () => {
    const { app } = buildApp();
    await create(app);
    const put = await app.inject({
      method: 'PUT',
      url: `/staff/checks/templates/${TEMPLATE}`,
      payload: { ...updateBody, name: 'Tractor unit (new)' },
      ...as('builder'),
    });
    expect(put.json()).toMatchObject({ name: 'Tractor unit (new)', version: 2 });
    const del = await app.inject({
      method: 'DELETE',
      url: `/staff/checks/templates/${TEMPLATE}`,
      ...as('builder'),
    });
    expect(del.statusCode).toBe(204);
    const listed = await app.inject({
      method: 'GET',
      url: `/staff/checks/companies/${ACME}/templates`,
      ...as('builder'),
    });
    expect(listed.json()).toEqual({ templates: [] });
  });

  it('404s another company’s list on change, and an unknown one', async () => {
    const { app } = buildApp();
    await create(app);
    const put = await app.inject({
      method: 'PUT',
      url: `/staff/checks/templates/${TEMPLATE}`,
      payload: updateBody,
      ...as('outsider'),
    });
    expect(put.statusCode).toBe(404);
    const missing = await app.inject({
      method: 'DELETE',
      url: '/staff/checks/templates/nope',
      ...as('builder'),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('400s a malformed list, and a vehicle that is not the company’s', async () => {
    const { app } = buildApp();
    const noQuestions = await app.inject({
      method: 'POST',
      url: `/staff/checks/companies/${ACME}/templates`,
      payload: { ...body, items: [] },
      ...as('builder'),
    });
    expect(noQuestions.statusCode).toBe(400);
    const badKind = await app.inject({
      method: 'POST',
      url: `/staff/checks/companies/${ACME}/templates`,
      payload: { ...body, items: [{ id: 'x', kind: 'dropdown', label: 'x', required: true }] },
      ...as('builder'),
    });
    expect(badKind.statusCode).toBe(400);
    const theirVehicle = await app.inject({
      method: 'POST',
      url: `/staff/checks/companies/${ACME}/templates`,
      payload: { ...body, appliesTo: 'selected', vehicleIds: ['lorry-beta'] },
      ...as('builder'),
    });
    expect(theirVehicle.statusCode).toBe(400);
    expect(theirVehicle.json()).toMatchObject({ tag: 'VehicleNotInCompany' });
  });

  it('serves an example list to start from, and needs a sign-in', async () => {
    const { app } = buildApp();
    const starter = await app.inject({
      method: 'GET',
      url: '/staff/checks/starter',
      ...as('builder'),
    });
    expect(starter.statusCode).toBe(200);
    expect(starter.json<{ name: string; items: unknown[] }>().items.length).toBeGreaterThan(10);
    expect((await app.inject({ method: 'GET', url: '/staff/checks/starter' })).statusCode).toBe(
      401,
    );
  });

  it('starts a company with both rules off, lets a fleet manager turn them on, and keeps others from changing them', async () => {
    const { app } = buildApp();
    const url = `/staff/checks/companies/${ACME}/settings`;
    const first = await app.inject({ method: 'GET', url, ...as('viewer') });
    expect(first.json()).toEqual({ requiredBeforeJob: false, blockOnDoNotDrive: false });

    const on = { requiredBeforeJob: true, blockOnDoNotDrive: true };
    expect(
      (await app.inject({ method: 'PUT', url, payload: on, ...as('viewer') })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'PUT', url, payload: on, ...as('outsider') })).statusCode,
    ).toBe(403);
    const put = await app.inject({ method: 'PUT', url, payload: on, ...as('builder') });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(on);
    expect((await app.inject({ method: 'GET', url, ...as('viewer') })).json()).toEqual(on);
    expect((await app.inject({ method: 'GET', url, ...as('outsider') })).statusCode).toBe(403);
  });

  it('400s a settings body that is not two true-or-false answers', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: `/staff/checks/companies/${ACME}/settings`,
      payload: { requiredBeforeJob: 'yes' },
      ...as('builder'),
    });
    expect(response.statusCode).toBe(400);
  });
});
