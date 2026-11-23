import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerErrorHandling } from '../host/error-handler.js';
import { registerStaffAuth } from '../host/staff-auth.js';
import { createBillingModule } from '../modules/billing/api.js';
import { createCompaniesModule, type CompaniesModule } from '../modules/companies/api.js';
import {
  createPaymentsModule,
  type PaymentProvider,
  type PaymentsModule,
} from '../modules/payments/api.js';
import { attachPoolErrorHandler } from '../platform/db.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import { FakeClock } from '../shared/testing/fake-clock.js';

/** The signature a test message carries for the stand-in provider to accept it. */
const FAKE_SIGNATURE = 'fake-signature';

/** A stand-in payment provider: messages are JSON events signed with `FAKE_SIGNATURE`, and what it is asked is recorded. */
class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  readonly available = true;
  readonly setups: { companyId: string; returnUrl: string }[] = [];
  readonly collected: { invoiceId: string; amountPence: number }[] = [];

  createSetupSession(input: { companyId: string; returnUrl: string }) {
    this.setups.push({ companyId: input.companyId, returnUrl: input.returnUrl });
    return Promise.resolve({ url: `https://pay.example.test/setup/${input.companyId}` });
  }

  collect(input: { invoiceId: string; amountPence: number }) {
    this.collected.push({ invoiceId: input.invoiceId, amountPence: input.amountPence });
    return Promise.resolve({});
  }

  readEvent(input: { body: string; signature: string | undefined }) {
    if (input.signature !== FAKE_SIGNATURE) return { ok: false as const };
    return { ok: true as const, event: JSON.parse(input.body) as never };
  }
}

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const ADMIN = '90000000-0000-4000-8000-000000000001';
const BOSS = '90000000-0000-4000-8000-000000000002';
const OTHER_BOSS = '90000000-0000-4000-8000-000000000003';
const ACME = '91000000-0000-4000-8000-000000000001';
const BETA = '91000000-0000-4000-8000-000000000002';
const TRIALLER = '91000000-0000-4000-8000-000000000003';
const INV = '92000000-0000-4000-8000-000000000001';

/**
 * Payments on real Postgres with Row-Level Security, the real companies and billing modules, the real staff-auth hook, and a fake payment
 * provider: a paused company can still add payment details; the provider's messages settle an invoice and bring the company back in one
 * transaction, once however often they are sent; a failed payment makes an active company overdue; a finished free period with details on
 * file becomes active; and a company can read only its own payment row.
 */
describe('payments end to end (real RLS, real hook, fake provider)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;
  let app: FastifyInstance;
  let companies: CompaniesModule;
  let payments: PaymentsModule;
  const provider = new FakePaymentProvider();
  const clock = new FakeClock('2026-12-01T10:00:00.000Z');
  const emails: { to: string; subject: string }[] = [];
  const advance = () => clock.advance(10_000); // past the gate's few seconds of memory

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    attachPoolErrorHandler(ownerPool, () => undefined);
    await runMigrations(ownerPool, migrationsDir);
    await ownerPool.query(`alter role wagonwise_app with login password 'app-password'`);
    const url = new URL(container.getConnectionUri());
    url.username = 'wagonwise_app';
    url.password = 'app-password';
    appPool = new Pool({ connectionString: url.toString(), max: 1 });
    attachPoolErrorHandler(appPool, () => undefined);
    const scopes = new PostgresDataScopes(appPool);
    const db = new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: scopes.pool }),
    });

    const q = (text: string, values: unknown[] = []) => ownerPool.query(text, values);
    await q(
      `insert into companies.companies (id, name, created_at, account_status, paused_at, trial_ends_on) values
        ($1,'Acme Haulage',now(),'paused',now(),null),
        ($2,'Beta Freight',now(),'active',null,null),
        ($3,'Trial Ltd',now(),'trial',null,'2026-11-30')`,
      [ACME, BETA, TRIALLER],
    );
    await q(
      `insert into companies.staff_accounts (id, kind, company_id, email, name, privileges, created_at, password_hash, second_factor_method)
       values ($1,'platform',null,'admin@wagonwise.test','Admin','[]',now(),'x','email'),
              ($2,'fleet',$4,'boss@acme.test','Acme Boss','["manage_users","manage_billing"]',now(),'x','email'),
              ($3,'fleet',$5,'boss@beta.test','Beta Boss','["manage_users","manage_billing"]',now(),'x','email')`,
      [ADMIN, BOSS, OTHER_BOSS, ACME, BETA],
    );
    await q(
      `insert into billing.invoices (id, company_id, company_name, month, status, number, seq, created_at, issued_at, issued_details)
       values ($1,$2,'Acme Haulage','2026-11','issued','INV-0001',1,now(),now(),'{}')`,
      [INV, ACME],
    );
    await q(
      `insert into billing.invoice_lines (id, invoice_id, position, description, quantity, unit_pence, amount_pence)
       values (gen_random_uuid(), $1, 1, 'Vehicles', 1, 2500, 2500)`,
      [INV],
    );

    const composed: { payments?: PaymentsModule } = {};
    companies = createCompaniesModule({
      db,
      clock,
      ids: new UuidIdGenerator(),
      dataScopes: scopes,
      identity: {
        sendOneTimeCode: () => Promise.resolve(),
        sendEmail: (to: string, subject: string) => {
          emails.push({ to, subject });
          return Promise.resolve();
        },
        signStaffAccessToken: () => Promise.resolve({ token: 't', expiresAt: new Date() }),
      } as never,
      payments: {
        hasPaymentMethod: (companyId) => {
          if (composed.payments === undefined) throw new Error('payments not composed yet');
          return composed.payments.hasPaymentMethod(companyId);
        },
      },
    });
    const billing = createBillingModule({
      db,
      clock,
      ids: new UuidIdGenerator(),
      dataScopes: scopes,
      callers: { getCaller: (id) => companies.getStaffCaller(id) },
      companies: { list: () => Promise.resolve([]) },
      vehicles: { countFor: () => Promise.resolve(0) },
    });
    payments = createPaymentsModule({
      db,
      clock,
      ids: new UuidIdGenerator(),
      dataScopes: scopes,
      callers: { getCaller: (id) => companies.getStaffCaller(id) },
      provider,
      ledger: {
        find: (id) => billing.findInvoiceForCollection(id),
        countUnpaid: (id) => billing.countUnpaidInvoices(id),
        settle: (id) => billing.settleInvoice(id),
      },
      accounts: { record: (id, fact) => companies.recordPaymentFact(id, fact) },
      names: {
        nameOf: async (id) => (await companies.getCompanyNames([id])).get(id),
      },
      dashboardUrl: 'https://portal.example.test',
    });
    composed.payments = payments;

    app = Fastify();
    registerErrorHandling(app);
    registerStaffAuth(
      app,
      { verify: (token) => Promise.resolve({ staffId: token, sessionId: 'session' }) },
      (staffId, method, path) => companies.isStaffRequestRefused(staffId, method, path),
    );
    companies.registerRoutes(app);
    payments.registerRoutes(app);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  const as = (who: string) => ({ headers: { authorization: `Bearer ${who}` } });
  const webhook = (event: object, signature: string | null = FAKE_SIGNATURE) =>
    app.inject({
      method: 'POST',
      url: '/payments/webhook',
      payload: { body: JSON.stringify(event), ...(signature === null ? {} : { signature }) },
    });
  const statusOf = async (id: string) =>
    (
      await ownerPool.query<{ account_status: string }>(
        `select account_status from companies.companies where id = $1`,
        [id],
      )
    ).rows[0]?.account_status;
  const asRole = async (
    settings: Record<string, string>,
    work: (client: PoolClient) => Promise<void>,
  ) => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      for (const [name, value] of Object.entries(settings)) {
        await client.query('select set_config($1, $2, true)', [name, value]);
      }
      await work(client);
    } finally {
      await client.query('rollback');
      client.release();
    }
  };

  it('lets a paused company add payment details, while everything else it tries to change is refused', async () => {
    const setup = await app.inject({ method: 'POST', url: '/staff/payments/setup', ...as(BOSS) });
    expect(setup.statusCode).toBe(200);
    expect(setup.json()).toEqual({ url: `https://pay.example.test/setup/${ACME}` });
    expect(provider.setups[0]?.returnUrl).toBe(
      'https://portal.example.test/staff/plan?payment=done',
    );

    const refused = await app.inject({
      method: 'PUT',
      url: `/staff/companies/${ACME}/settings`,
      payload: { photoRetentionMonths: 6 },
      ...as(BOSS),
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: 'account_paused' });
    // Collecting is WagonWise's, and is a change: a paused company cannot ask for it.
    const collect = await app.inject({
      method: 'POST',
      url: '/staff/payments/collect',
      payload: { invoiceId: INV },
      ...as(BOSS),
    });
    expect(collect.statusCode).toBe(403);
  });

  it('refuses a message that is not signed, and changes nothing', async () => {
    expect(
      (await webhook({ id: 'evt-0', kind: 'setup_completed', companyId: ACME }, 'wrong'))
        .statusCode,
    ).toBe(401);
    expect(
      (await webhook({ id: 'evt-0', kind: 'setup_completed', companyId: ACME }, null)).statusCode,
    ).toBe(401);
    expect(await statusOf(ACME)).toBe('paused');
    const { rows } = await ownerPool.query(
      `select * from payments.customers where company_id = $1`,
      [ACME],
    );
    expect(rows.every((r: { details_on_file: boolean }) => r.details_on_file === false)).toBe(true);
  });

  it('details added while an invoice is still owed: on file, but the company stays paused', async () => {
    expect(
      (await webhook({ id: 'evt-1', kind: 'setup_completed', companyId: ACME })).statusCode,
    ).toBe(204);
    const { rows } = await ownerPool.query<{ details_on_file: boolean }>(
      `select details_on_file from payments.customers where company_id = $1`,
      [ACME],
    );
    expect(rows[0]?.details_on_file).toBe(true);
    expect(await statusOf(ACME)).toBe('paused');
    expect(emails).toEqual([]);
  });

  it('collects the invoice for WagonWise staff, once at a time', async () => {
    const collect = () =>
      app.inject({
        method: 'POST',
        url: '/staff/payments/collect',
        payload: { invoiceId: INV },
        ...as(ADMIN),
      });
    const first = await collect();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ amountPence: 2500 });
    expect(provider.collected).toEqual([{ invoiceId: INV, amountPence: 2500 }]);
    const second = await collect();
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ tag: 'AlreadyCollecting' });
    const { rows } = await ownerPool.query(
      `select status from payments.collections where invoice_id = $1`,
      [INV],
    );
    expect(rows).toEqual([{ status: 'requested' }]);
  });

  it('a payment of the wrong amount changes nothing', async () => {
    expect(
      (
        await webhook({
          id: 'evt-2',
          kind: 'payment_succeeded',
          companyId: ACME,
          invoiceId: INV,
          amountPence: 100,
        })
      ).statusCode,
    ).toBe(204);
    const { rows } = await ownerPool.query<{ status: string }>(
      `select status from billing.invoices where id = $1`,
      [INV],
    );
    expect(rows[0]?.status).toBe('issued');
    expect(await statusOf(ACME)).toBe('paused');
  });

  it('a payment of the right amount settles the invoice, brings the company back and writes to it, once', async () => {
    const paid = {
      id: 'evt-3',
      kind: 'payment_succeeded',
      companyId: ACME,
      invoiceId: INV,
      amountPence: 2500,
    };
    expect((await webhook(paid)).statusCode).toBe(204);
    const { rows } = await ownerPool.query<{ status: string; paid_at: Date | null }>(
      `select status, paid_at from billing.invoices where id = $1`,
      [INV],
    );
    expect(rows[0]?.status).toBe('paid');
    expect(rows[0]?.paid_at).not.toBeNull();
    expect(await statusOf(ACME)).toBe('active');
    expect(emails.map((e) => [e.to, e.subject])).toEqual([
      ['boss@acme.test', 'The WagonWise account for Acme Haulage is active again'],
    ]);
    const moves = await ownerPool.query(
      `select from_status, to_status, by_staff_id, note from companies.account_state_log where company_id = $1`,
      [ACME],
    );
    expect(moves.rows).toEqual([
      {
        from_status: 'paused',
        to_status: 'active',
        by_staff_id: null,
        note: 'Automatic: payment received',
      },
    ]);
    const attempts = await ownerPool.query(
      `select status from payments.collections where invoice_id = $1`,
      [INV],
    );
    expect(attempts.rows).toEqual([{ status: 'paid' }]);

    // Sent again, as a provider does: nothing happens a second time.
    expect((await webhook(paid)).statusCode).toBe(204);
    expect(emails).toHaveLength(1);
    const processed = await ownerPool.query(
      `select event_id from payments.processed_events where event_id = 'evt-3'`,
    );
    expect(processed.rows).toHaveLength(1);
  });

  it('then lets the company change things again', async () => {
    advance();
    const changed = await app.inject({
      method: 'PUT',
      url: `/staff/companies/${ACME}/settings`,
      payload: { photoRetentionMonths: 6 },
      ...as(BOSS),
    });
    expect(changed.statusCode).toBe(200);
  });

  it('a failed payment makes an active company overdue when the automatic rules are on, and not before', async () => {
    const failed = (id: string) => ({
      id,
      kind: 'payment_failed',
      companyId: BETA,
      invoiceId: '92000000-0000-4000-8000-000000000099',
      reason: 'insufficient funds',
    });
    await webhook(failed('evt-4'));
    expect(await statusOf(BETA)).toBe('active'); // the rules are off
    const set = await app.inject({
      method: 'PUT',
      url: '/staff/account-settings',
      payload: { defaultTrialDays: 90, graceDays: 14, automation: 'full' },
      ...as(ADMIN),
    });
    expect(set.statusCode).toBe(200);
    await webhook(failed('evt-5'));
    expect(await statusOf(BETA)).toBe('overdue');
    expect(emails.map((e) => e.subject)).toContain(
      'Payment for Beta Freight on WagonWise is overdue',
    );
  });

  it('a finished free period with payment details on file becomes active, not overdue', async () => {
    await ownerPool.query(
      `insert into payments.customers (company_id, provider, details_on_file) values ($1, 'fake', true)`,
      [TRIALLER],
    );
    const done = await companies.runAccountRules();
    expect(done.failed).toBe(0);
    expect(await statusOf(TRIALLER)).toBe('active');
    const moves = await ownerPool.query<{ note: string }>(
      `select note from companies.account_state_log where company_id = $1`,
      [TRIALLER],
    );
    expect(moves.rows[0]?.note).toContain('payment details are on file');
  });

  it('row-level security: a company reads only its own payment row, and nothing else here', async () => {
    await asRole({ 'app.company_id': BETA }, async (c) => {
      const mine = await c.query('select company_id from payments.customers');
      expect((mine.rows as { company_id: string }[]).every((r) => r.company_id === BETA)).toBe(
        true,
      );
      expect(
        (await c.query('select count(*)::int as n from payments.collections')).rows[0],
      ).toEqual({ n: 0 });
      expect(
        (await c.query('select count(*)::int as n from payments.processed_events')).rows[0],
      ).toEqual({ n: 0 });
    });
    await asRole({ 'app.platform_staff': 'on' }, async (c) => {
      const all = await c.query('select count(*)::int as n from payments.processed_events');
      expect((all.rows[0] as { n: number }).n).toBeGreaterThan(0);
    });
    await asRole({ 'app.company_id': BETA }, async (c) => {
      await expect(
        c.query(
          `insert into payments.customers (company_id, provider, details_on_file) values ($1, 'fake', true)`,
          [ACME],
        ),
      ).rejects.toThrow();
    });
  });

  it("the billing status page says whether details are on file, for the person's own company", async () => {
    const mine = await app.inject({ method: 'GET', url: '/staff/payments/status', ...as(BOSS) });
    expect(mine.json()).toEqual({ available: true, detailsOnFile: true });
    const other = await app.inject({
      method: 'GET',
      url: '/staff/payments/status',
      ...as(OTHER_BOSS),
    });
    expect(other.json()).toEqual({ available: true, detailsOnFile: false });
  });
});
