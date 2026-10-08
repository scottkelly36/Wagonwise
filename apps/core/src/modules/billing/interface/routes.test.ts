import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import type { StaffCaller } from '../application/ports/directories.js';
import { InMemoryBillingDetailsRepository } from '../application/testing/in-memory-billing-details-repository.js';
import { InMemoryPlanRepository } from '../application/testing/in-memory-plan-repository.js';
import { InMemoryCostRepository } from '../application/testing/in-memory-cost-repository.js';
import { InMemoryInvoiceRepository } from '../application/testing/in-memory-invoice-repository.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { makeId } from '../../../shared/brand.js';
import { registerBillingRoutes } from './routes.js';

const STAFF_HEADER = 'x-test-staff-id';
const ACME = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');

const staff: Record<string, StaffCaller> = {
  admin: { kind: 'platform' },
  billing: {
    kind: 'fleet',
    companyId: '11111111-1111-4111-8111-111111111111',
    privileges: ['manage_billing'],
  },
  other: {
    kind: 'fleet',
    companyId: '22222222-2222-4222-8222-222222222222',
    privileges: ['manage_billing'],
  },
  manager: {
    kind: 'fleet',
    companyId: '11111111-1111-4111-8111-111111111111',
    privileges: ['manage_users', 'dispatch', 'view_reports'],
  },
};

function buildApp(): { app: FastifyInstance; scopes: RecordingDataScopes } {
  const scopes = new RecordingDataScopes();
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const staffId = request.headers[STAFF_HEADER];
    if (typeof staffId === 'string') request.staffId = staffId;
    done();
  });
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const details = new InMemoryBillingDetailsRepository();
  const plans = new InMemoryPlanRepository();
  const companies = { list: () => Promise.resolve([{ id: ACME, name: 'Acme Freight' }]) };
  const invoiceRepo = new InMemoryInvoiceRepository();
  registerBillingRoutes(app, {
    billing: { repo: details, clock },
    plans: { plans, companies, clock },
    invoices: {
      invoices: invoiceRepo,
      details,
      plans,
      companies,
      ids: new SequentialIdGenerator(),
      clock,
    },
    finance: {
      costs: new InMemoryCostRepository(),
      invoices: invoiceRepo,
      plans,
      companies,
      ids: new SequentialIdGenerator(),
      clock,
    },
    own: {
      plans,
      invoices: invoiceRepo,
      vehicles: { countFor: () => Promise.resolve(3) },
      clock,
    },
    callerDirectory: { getCaller: (id) => Promise.resolve(staff[id] ?? null) },
    dataScopes: scopes,
  });
  return { app, scopes };
}

const as = (id: string) => ({ headers: { [STAFF_HEADER]: id } });
const real = {
  tradingName: 'WagonWise Ltd',
  address: '1 High Street, Hexham',
  contactEmail: 'billing@example.com',
  paymentDetails: 'Sort code 00-00-00, account 00000000',
  vatStatus: 'Not VAT registered',
  paymentTerms: '14 days',
};

describe('/staff/billing/details', () => {
  it('shows an admin the details, in the platform scope, with every placeholder named', async () => {
    const { app, scopes } = buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/staff/billing/details',
      ...as('admin'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ placeholders: string[] }>().placeholders).toHaveLength(6);
    expect(scopes.used).toEqual([{ kind: 'platform' }]);
  });

  it('lets an admin save, and then reports no placeholders', async () => {
    const { app } = buildApp();
    const put = await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: real,
      ...as('admin'),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ ...real, placeholders: [] });
    const get = await app.inject({ method: 'GET', url: '/staff/billing/details', ...as('admin') });
    expect(get.json()).toMatchObject({ tradingName: 'WagonWise Ltd', placeholders: [] });
  });

  it('refuses a company manager for reading and writing, without opening any data scope', async () => {
    const { app, scopes } = buildApp();
    const get = await app.inject({
      method: 'GET',
      url: '/staff/billing/details',
      ...as('manager'),
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: real,
      ...as('manager'),
    });
    expect(get.statusCode).toBe(403);
    expect(put.statusCode).toBe(403);
    expect(scopes.used).toEqual([]);
  });

  it('401s with no staff token and 403s an unknown account', async () => {
    const { app } = buildApp();
    expect((await app.inject({ method: 'GET', url: '/staff/billing/details' })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/staff/billing/details', ...as('nobody') }))
        .statusCode,
    ).toBe(403);
  });

  it('400s a body with a missing or empty field', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: { ...real, address: '' },
      ...as('admin'),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('/staff/billing/companies', () => {
  const url = `/staff/billing/companies/${ACME}`;

  it('lists each company with its price and capacity, and updates after a change', async () => {
    const { app } = buildApp();
    const before = await app.inject({
      method: 'GET',
      url: '/staff/billing/companies',
      ...as('admin'),
    });
    expect(before.json()).toEqual({
      plans: [
        {
          companyId: ACME,
          name: 'Acme Freight',
          pricePerVehiclePence: 1000,
          capacityToday: 0,
          monthlyPence: 0,
        },
      ],
    });
    const set = await app.inject({
      method: 'POST',
      url: `${url}/capacity`,
      payload: { capacity: 5, effectiveFrom: '2026-10-09' },
      ...as('admin'),
    });
    expect(set.statusCode).toBe(201);
    await app.inject({
      method: 'PUT',
      url: `${url}/price`,
      payload: { pricePerVehiclePence: 1500 },
      ...as('admin'),
    });
    const after = await app.inject({
      method: 'GET',
      url: '/staff/billing/companies',
      ...as('admin'),
    });
    expect(after.json<{ plans: object[] }>().plans[0]).toMatchObject({
      capacityToday: 5,
      pricePerVehiclePence: 1500,
      monthlyPence: 7500,
    });
    const history = await app.inject({ method: 'GET', url: `${url}/capacity`, ...as('admin') });
    expect(history.json()).toEqual({ changes: [{ effectiveFrom: '2026-10-09', capacity: 5 }] });
  });

  it('refuses a past day with 400, and an unknown company with 404', async () => {
    const { app } = buildApp();
    const past = await app.inject({
      method: 'POST',
      url: `${url}/capacity`,
      payload: { capacity: 5, effectiveFrom: '2026-10-01' },
      ...as('admin'),
    });
    expect(past.statusCode).toBe(400);
    expect(past.json()).toMatchObject({ tag: 'DayInPast' });
    const missing = await app.inject({
      method: 'POST',
      url: '/staff/billing/companies/nobody/capacity',
      payload: { capacity: 5, effectiveFrom: '2026-10-09' },
      ...as('admin'),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('refuses a company manager on every plan route', async () => {
    const { app } = buildApp();
    const attempts = [
      app.inject({ method: 'GET', url: '/staff/billing/companies', ...as('manager') }),
      app.inject({ method: 'GET', url: `${url}/capacity`, ...as('manager') }),
      app.inject({
        method: 'PUT',
        url: `${url}/price`,
        payload: { pricePerVehiclePence: 1 },
        ...as('manager'),
      }),
      app.inject({
        method: 'POST',
        url: `${url}/capacity`,
        payload: { capacity: 99, effectiveFrom: '2026-10-09' },
        ...as('manager'),
      }),
    ];
    for (const response of await Promise.all(attempts)) expect(response.statusCode).toBe(403);
  });
});

describe('/staff/billing/invoices', () => {
  const generate = (app: FastifyInstance, month = '2026-10') =>
    app.inject({
      method: 'POST',
      url: '/staff/billing/invoices/generate',
      payload: { month },
      ...as('admin'),
    });
  async function withDraft() {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: `/staff/billing/companies/${ACME}/capacity`,
      payload: { capacity: 5, effectiveFrom: '2026-10-09' },
      ...as('admin'),
    });
    const generated = await generate(app, '2026-10');
    const draft = generated.json<{ created: { id: string; totalPence: number }[] }>().created[0]!;
    return { app, draft };
  }

  it('drafts the month’s invoice, lists it, and shows it with its lines', async () => {
    const { app, draft } = await withDraft();
    // Capacity began on the 9th, after the 1st, so October is billed as a rise: 5 vehicles for 23 of 31 days.
    expect(draft.totalPence).toBe(Math.round((5 * 1000 * 23) / 31));
    const list = await app.inject({
      method: 'GET',
      url: '/staff/billing/invoices',
      ...as('admin'),
    });
    expect(list.json<{ invoices: unknown[] }>().invoices).toHaveLength(1);
    const one = await app.inject({
      method: 'GET',
      url: `/staff/billing/invoices/${draft.id}`,
      ...as('admin'),
    });
    expect(one.json()).toMatchObject({
      status: 'draft',
      companyName: 'Acme Freight',
      month: '2026-10',
    });
  });

  it('will not issue while the billing details hold placeholders, then issues with a number once filled in', async () => {
    const { app, draft } = await withDraft();
    const refused = await app.inject({
      method: 'POST',
      url: `/staff/billing/invoices/${draft.id}/issue`,
      ...as('admin'),
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ tag: 'BillingDetailsIncomplete' });

    await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: real,
      ...as('admin'),
    });
    const issued = await app.inject({
      method: 'POST',
      url: `/staff/billing/invoices/${draft.id}/issue`,
      ...as('admin'),
    });
    expect(issued.statusCode).toBe(200);
    expect(issued.json()).toMatchObject({ status: 'issued', number: 'INV-0001' });

    const paid = await app.inject({
      method: 'POST',
      url: `/staff/billing/invoices/${draft.id}/paid`,
      ...as('admin'),
    });
    expect(paid.json()).toMatchObject({ status: 'paid' });
  });

  it('adds a credit line to a draft and refuses to touch it once issued', async () => {
    const { app, draft } = await withDraft();
    const credited = await app.inject({
      method: 'POST',
      url: `/staff/billing/invoices/${draft.id}/lines`,
      payload: { description: 'Goodwill credit', amountPence: -500 },
      ...as('admin'),
    });
    expect(credited.json<{ totalPence: number }>().totalPence).toBe(draft.totalPence - 500);
    await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: real,
      ...as('admin'),
    });
    await app.inject({
      method: 'POST',
      url: `/staff/billing/invoices/${draft.id}/issue`,
      ...as('admin'),
    });
    const late = await app.inject({
      method: 'POST',
      url: `/staff/billing/invoices/${draft.id}/lines`,
      payload: { description: 'Too late', amountPence: 100 },
      ...as('admin'),
    });
    expect(late.statusCode).toBe(409);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/staff/billing/invoices/${draft.id}`,
      ...as('admin'),
    });
    expect(deleted.statusCode).toBe(409);
  });

  it('deletes a draft with 204, and 400s a bad month, 404s an unknown invoice', async () => {
    const { app, draft } = await withDraft();
    const gone = await app.inject({
      method: 'DELETE',
      url: `/staff/billing/invoices/${draft.id}`,
      ...as('admin'),
    });
    expect(gone.statusCode).toBe(204);
    expect((await generate(app, '2026-13')).statusCode).toBe(400);
    expect((await generate(app, '2026-12')).statusCode).toBe(400);
    const missing = await app.inject({
      method: 'GET',
      url: '/staff/billing/invoices/nope',
      ...as('admin'),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('refuses a company manager on every invoice route', async () => {
    const { app } = buildApp();
    const attempts = [
      app.inject({ method: 'GET', url: '/staff/billing/invoices', ...as('manager') }),
      app.inject({
        method: 'POST',
        url: '/staff/billing/invoices/generate',
        payload: { month: '2026-10' },
        ...as('manager'),
      }),
      app.inject({ method: 'GET', url: '/staff/billing/invoices/x', ...as('manager') }),
      app.inject({ method: 'POST', url: '/staff/billing/invoices/x/issue', ...as('manager') }),
      app.inject({ method: 'POST', url: '/staff/billing/invoices/x/paid', ...as('manager') }),
      app.inject({ method: 'DELETE', url: '/staff/billing/invoices/x', ...as('manager') }),
    ];
    for (const response of await Promise.all(attempts)) expect(response.statusCode).toBe(403);
  });
});

describe('a company’s own billing: /staff/billing/my', () => {
  it('shows a billing manager their own plan, in their own company’s data scope', async () => {
    const { app, scopes } = buildApp();
    await app.inject({
      method: 'POST',
      url: `/staff/billing/companies/${ACME}/capacity`,
      payload: { capacity: 5, effectiveFrom: '2026-10-09' },
      ...as('admin'),
    });
    scopes.used.length = 0;
    const response = await app.inject({
      method: 'GET',
      url: '/staff/billing/my/plan',
      ...as('billing'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      capacityToday: 5,
      vehiclesInUse: 3,
      pricePerVehiclePence: 1000,
      monthlyPence: 5000,
    });
    expect(scopes.used).toEqual([{ kind: 'company', companyId: ACME }]);
  });

  it('lists the company’s issued invoices and never its drafts', async () => {
    const { app } = buildApp();
    await app.inject({
      method: 'POST',
      url: `/staff/billing/companies/${ACME}/capacity`,
      payload: { capacity: 5, effectiveFrom: '2026-10-09' },
      ...as('admin'),
    });
    const generated = await app.inject({
      method: 'POST',
      url: '/staff/billing/invoices/generate',
      payload: { month: '2026-10' },
      ...as('admin'),
    });
    const id = generated.json<{ created: { id: string }[] }>().created[0]!.id;

    const beforeIssue = await app.inject({
      method: 'GET',
      url: '/staff/billing/my/invoices',
      ...as('billing'),
    });
    expect(beforeIssue.json()).toEqual({ invoices: [] });

    await app.inject({
      method: 'PUT',
      url: '/staff/billing/details',
      payload: real,
      ...as('admin'),
    });
    await app.inject({
      method: 'POST',
      url: `/staff/billing/invoices/${id}/issue`,
      ...as('admin'),
    });
    const after = await app.inject({
      method: 'GET',
      url: '/staff/billing/my/invoices',
      ...as('billing'),
    });
    expect(after.json<{ invoices: { number: string }[] }>().invoices.map((i) => i.number)).toEqual([
      'INV-0001',
    ]);

    // Another company's billing manager sees none of it.
    const other = await app.inject({
      method: 'GET',
      url: '/staff/billing/my/invoices',
      ...as('other'),
    });
    expect(other.json()).toEqual({ invoices: [] });
  });

  it('refuses staff without billing, and WagonWise admins here, and needs a sign-in', async () => {
    const { app } = buildApp();
    for (const who of ['manager', 'admin', 'nobody']) {
      for (const path of ['/staff/billing/my/plan', '/staff/billing/my/invoices']) {
        const response = await app.inject({ method: 'GET', url: path, ...as(who) });
        expect(response.statusCode).toBe(403);
      }
    }
    expect((await app.inject({ method: 'GET', url: '/staff/billing/my/plan' })).statusCode).toBe(
      401,
    );
  });
});

describe('/staff/billing/finance and costs', () => {
  const addHosting = (app: FastifyInstance, extra: object = {}) =>
    app.inject({
      method: 'POST',
      url: '/staff/billing/costs',
      payload: {
        category: 'hosting',
        description: 'Servers',
        amountPence: 5000,
        fromMonth: '2026-08',
        oneOff: false,
        ...extra,
      },
      ...as('admin'),
    });

  it('adds a standing cost once and shows it in every month from then on', async () => {
    const { app } = buildApp();
    const added = await addHosting(app);
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ description: 'Servers', fromMonth: '2026-08' });
    const report = await app.inject({
      method: 'GET',
      url: '/staff/billing/finance?month=2026-10',
      ...as('admin'),
    });
    expect(report.statusCode).toBe(200);
    const body = report.json<{
      months: { month: string; costsPence: number }[];
      costs: { description: string }[];
    }>();
    expect(body.months.slice(-4).map((m) => [m.month, m.costsPence])).toEqual([
      ['2026-07', 0],
      ['2026-08', 5000],
      ['2026-09', 5000],
      ['2026-10', 5000],
    ]);
    expect(body.costs.map((c) => c.description)).toEqual(['Servers']);
  });

  it('changes a cost from a later month without rewriting the months before, and stops it', async () => {
    const { app } = buildApp();
    const id = (await addHosting(app)).json<{ id: string }>().id;
    const changed = await app.inject({
      method: 'PUT',
      url: `/staff/billing/costs/${id}`,
      payload: {
        category: 'hosting',
        description: 'Servers',
        amountPence: 8000,
        fromMonth: '2026-10',
      },
      ...as('admin'),
    });
    expect(changed.json()).toMatchObject({ amountPence: 8000, fromMonth: '2026-10' });
    const newId = changed.json<{ id: string }>().id;
    const stop = await app.inject({
      method: 'POST',
      url: `/staff/billing/costs/${newId}/stop`,
      payload: { fromMonth: '2026-11' },
      ...as('admin'),
    });
    expect(stop.statusCode).toBe(204);
    const report = await app.inject({
      method: 'GET',
      url: '/staff/billing/finance?month=2026-11',
      ...as('admin'),
    });
    const months = report.json<{ months: { costsPence: number }[] }>().months;
    expect(months.slice(-4).map((m) => m.costsPence)).toEqual([5000, 5000, 8000, 0]);
  });

  it('removes a cost entered by mistake, and 404s an unknown one', async () => {
    const { app } = buildApp();
    const id = (await addHosting(app)).json<{ id: string }>().id;
    const gone = await app.inject({
      method: 'DELETE',
      url: `/staff/billing/costs/${id}`,
      ...as('admin'),
    });
    expect(gone.statusCode).toBe(204);
    const again = await app.inject({
      method: 'DELETE',
      url: `/staff/billing/costs/${id}`,
      ...as('admin'),
    });
    expect(again.statusCode).toBe(404);
  });

  it('400s a bad entry and 409s a change that makes no sense', async () => {
    const { app } = buildApp();
    expect((await addHosting(app, { amountPence: -1 })).statusCode).toBe(400);
    expect((await addHosting(app, { category: 'lunch' })).statusCode).toBe(400);
    const id = (await addHosting(app)).json<{ id: string }>().id;
    const early = await app.inject({
      method: 'PUT',
      url: `/staff/billing/costs/${id}`,
      payload: {
        category: 'hosting',
        description: 'Servers',
        amountPence: 1,
        fromMonth: '2026-01',
      },
      ...as('admin'),
    });
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ tag: 'InvalidCostChange' });
  });

  it('refuses a company manager on every finance route', async () => {
    const { app } = buildApp();
    const attempts = [
      app.inject({ method: 'GET', url: '/staff/billing/finance', ...as('manager') }),
      app.inject({
        method: 'POST',
        url: '/staff/billing/costs',
        payload: {
          category: 'hosting',
          description: 'x',
          amountPence: 1,
          fromMonth: '2026-10',
          oneOff: false,
        },
        ...as('manager'),
      }),
      app.inject({ method: 'DELETE', url: '/staff/billing/costs/x', ...as('manager') }),
    ];
    for (const response of await Promise.all(attempts)) expect(response.statusCode).toBe(403);
  });
});
