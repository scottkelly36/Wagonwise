import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { StaffCaller } from '../application/ports/directories.js';
import {
  FAKE_SIGNATURE,
  FakeLedger,
  FakePaymentProvider,
  InMemoryCollections,
  InMemoryPaymentCustomers,
  InMemoryProcessedEvents,
} from '../application/testing/fakes.js';
import { registerPaymentRoutes } from './routes.js';

const ADMIN = 'staff-admin';
const BOSS = 'staff-boss';
const DISP = 'staff-disp';
const ACME = '71000000-0000-4000-8000-000000000001';
const INV = '72000000-0000-4000-8000-000000000001';
const people: Record<string, StaffCaller> = {
  [ADMIN]: { kind: 'platform', staffId: ADMIN },
  [BOSS]: { kind: 'fleet', staffId: BOSS, companyId: ACME, privileges: ['manage_billing'] },
  [DISP]: { kind: 'fleet', staffId: DISP, companyId: ACME, privileges: ['dispatch'] },
};

function build() {
  const provider = new FakePaymentProvider();
  const customers = new InMemoryPaymentCustomers();
  const ledger = new FakeLedger();
  const facts: string[] = [];
  const scopes = new RecordingDataScopes();
  const app: FastifyInstance = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const staffId = request.headers['x-test-staff-id'];
    if (typeof staffId === 'string') request.staffId = staffId;
    done();
  });
  registerPaymentRoutes(app, {
    payments: {
      provider,
      customers,
      collections: new InMemoryCollections(),
      processed: new InMemoryProcessedEvents(),
      ledger,
      accounts: {
        record: (_companyId, fact) => {
          facts.push(fact.kind);
          return Promise.resolve();
        },
      },
      names: { nameOf: () => Promise.resolve('Acme Haulage') },
      dashboardUrl: 'https://portal.example.test',
      clock: new FakeClock('2026-12-01T10:00:00.000Z'),
      ids: new SequentialIdGenerator(),
    },
    callerDirectory: { getCaller: (id) => Promise.resolve(people[id] ?? null) },
    dataScopes: scopes,
  });
  const as = (who: string) => ({ headers: { 'x-test-staff-id': who } });
  return { app, provider, customers, ledger, facts, scopes, as };
}

describe('payment routes', () => {
  it("the billing page asks whether details can be added, in the person's own company scope", async () => {
    const { app, as, scopes } = build();
    const res = await app.inject({ method: 'GET', url: '/staff/payments/status', ...as(BOSS) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: true, detailsOnFile: false });
    expect(scopes.used).toContainEqual({ kind: 'company', companyId: ACME });
    expect(
      (await app.inject({ method: 'GET', url: '/staff/payments/status', ...as(DISP) })).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/staff/payments/status' })).statusCode).toBe(
      401,
    );
  });

  it('starts the hosted page for the billing person, and says 409 when no provider is connected', async () => {
    const { app, as, provider } = build();
    const res = await app.inject({ method: 'POST', url: '/staff/payments/setup', ...as(BOSS) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ url: `https://pay.example.test/setup/${ACME}` });
    provider.available = false;
    const none = await app.inject({ method: 'POST', url: '/staff/payments/setup', ...as(BOSS) });
    expect(none.statusCode).toBe(409);
    expect(none.json()).toMatchObject({ tag: 'NotAvailable' });
  });

  it('collects an issued invoice for WagonWise staff only, and maps each refusal to a status', async () => {
    const { app, as, ledger, customers } = build();
    ledger.invoices.set(INV, {
      id: INV,
      companyId: ACME,
      number: 'INV-0001',
      status: 'issued',
      totalPence: 2500,
    });
    const collect = (who: string, invoiceId = INV) =>
      app.inject({
        method: 'POST',
        url: '/staff/payments/collect',
        payload: { invoiceId },
        ...as(who),
      });
    expect((await collect(BOSS)).statusCode).toBe(403);
    expect((await collect(ADMIN)).json()).toMatchObject({ tag: 'NoPaymentDetails' });
    await customers.upsert({
      companyId: ACME,
      provider: 'fake',
      detailsOnFile: true,
      at: new Date(),
    });
    const ok = await collect(ADMIN);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ amountPence: 2500 });
    const again = await collect(ADMIN);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ tag: 'AlreadyCollecting' });
    expect((await collect(ADMIN, '72000000-0000-4000-8000-000000000099')).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/staff/payments/collect',
          payload: { invoiceId: 'x' },
          ...as(ADMIN),
        })
      ).statusCode,
    ).toBe(400);
  });

  it("shows WagonWise staff a company's payments", async () => {
    const { app, as } = build();
    const res = await app.inject({
      method: 'GET',
      url: `/staff/companies/${ACME}/payments`,
      ...as(ADMIN),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: true, detailsOnFile: false, collections: [] });
    expect(
      (await app.inject({ method: 'GET', url: `/staff/companies/${ACME}/payments`, ...as(BOSS) }))
        .statusCode,
    ).toBe(403);
  });

  it("the webhook refuses an unsigned message with 401 and acknowledges a genuine one with 204, in WagonWise staff's scope", async () => {
    const { app, facts, customers, scopes } = build();
    const post = (signature?: string) =>
      app.inject({
        method: 'POST',
        url: '/payments/webhook',
        payload: {
          body: JSON.stringify({ id: 'evt-1', kind: 'setup_completed', companyId: ACME }),
          ...(signature === undefined ? {} : { signature }),
        },
      });
    expect((await post()).statusCode).toBe(401);
    expect((await post('wrong')).statusCode).toBe(401);
    expect(customers.rows.size).toBe(0);
    expect((await post(FAKE_SIGNATURE)).statusCode).toBe(204);
    expect(customers.rows.get(ACME)?.detailsOnFile).toBe(true);
    expect(facts).toEqual(['details_added']);
    expect(scopes.used).toContainEqual({ kind: 'platform' });
    // Sent again: still 204, nothing more happens.
    expect((await post(FAKE_SIGNATURE)).statusCode).toBe(204);
    expect(facts).toEqual(['details_added']);
    expect(
      (await app.inject({ method: 'POST', url: '/payments/webhook', payload: { nonsense: true } }))
        .statusCode,
    ).toBe(400);
  });
});
