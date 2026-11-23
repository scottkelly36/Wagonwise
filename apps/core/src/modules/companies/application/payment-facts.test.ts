import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { AccountState } from '../domain/account-state.js';
import type { FleetUser } from '../domain/staff-account.js';
import { applyPaymentFact } from './payment-facts.js';
import { runAccountRules, type AccountRuleDeps } from './run-account-rules.js';
import { InMemoryAccountEmailLog } from './testing/in-memory-account-email-log.js';
import { InMemoryAccountStateRepository } from './testing/in-memory-account-state-repository.js';
import { InMemoryCompanyRepository } from './testing/in-memory-company-repository.js';
import { InMemoryStaffAccountRepository } from './testing/in-memory-staff-repositories.js';

const ACME = makeId<'CompanyId'>('company-acme');

let sent: { to: string; subject: string }[];
let notices: string[];
let states: InMemoryAccountStateRepository;
let deps: AccountRuleDeps;
let detailsOnFile: boolean;

const state = (over: Partial<AccountState>): AccountState => ({
  companyId: ACME,
  status: 'paused',
  trialEndsOn: null,
  overdueSince: null,
  pausedAt: new Date('2026-11-01T09:00:00Z'),
  note: '',
  hold: false,
  ...over,
});

beforeEach(async () => {
  sent = [];
  notices = [];
  detailsOnFile = false;
  states = new InMemoryAccountStateRepository();
  states.settings = { ...states.settings, automation: 'full' };
  const accounts = new InMemoryStaffAccountRepository();
  const companies = new InMemoryCompanyRepository();
  await companies.save({
    id: ACME,
    name: 'Acme Haulage',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    photoRetentionMonths: 12,
  });
  const boss: FleetUser = {
    kind: 'fleet',
    id: makeId<'StaffId'>('boss'),
    email: 'boss@acme.test',
    name: 'Boss',
    companyId: ACME,
    privileges: ['manage_billing'],
    secondFactorMethod: 'totp',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  await accounts.create(boss, {
    staffId: boss.id,
    passwordHash: 'x',
    secondFactor: { method: 'totp', secretCiphertext: 'x' },
  });
  deps = {
    states,
    companies,
    accounts,
    emailLog: new InMemoryAccountEmailLog(),
    mailer: {
      send: (to, subject) => {
        sent.push({ to, subject });
        return Promise.resolve();
      },
    },
    ownerNotice: {
      send: (subject) => {
        notices.push(subject);
        return Promise.resolve();
      },
    },
    payments: { hasPaymentMethod: () => Promise.resolve(detailsOnFile) },
    dashboardUrl: undefined,
    clock: new FakeClock('2026-12-01T10:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    scoped: (work) => work(),
  };
});

describe('applyPaymentFact', () => {
  it('brings a paused company back when it has paid, logs it as the system, tells it and the owner', async () => {
    await states.save(state({}));
    const outcome = await applyPaymentFact(deps, ACME, {
      kind: 'paid_in_full',
      owesAnything: false,
    });
    expect(outcome).toEqual({ moved: 'active', emailed: true });
    const now = await states.get(ACME);
    expect(now).toMatchObject({ status: 'active', pausedAt: null, overdueSince: null });
    expect(states.moves[0]).toMatchObject({ from: 'paused', to: 'active', byStaffId: null });
    expect(states.moves[0]?.note).toBe('Automatic: payment received');
    expect(sent.map((s) => s.subject)).toEqual([
      'The WagonWise account for Acme Haulage is active again',
    ]);
    expect(notices).toContain('WagonWise moved Acme Haulage to active by itself');
  });

  it('is safe to repeat: the second time nothing moves and nobody is written to again', async () => {
    await states.save(state({}));
    await applyPaymentFact(deps, ACME, { kind: 'paid_in_full', owesAnything: false });
    const again = await applyPaymentFact(deps, ACME, { kind: 'paid_in_full', owesAnything: false });
    expect(again).toEqual({ moved: null, emailed: false });
    expect(sent).toHaveLength(1);
    expect(states.moves).toHaveLength(1);
  });

  it('leaves a company alone when something is still owed', async () => {
    await states.save(state({}));
    const outcome = await applyPaymentFact(deps, ACME, {
      kind: 'details_added',
      owesAnything: true,
    });
    expect(outcome).toEqual({ moved: null, emailed: false });
    expect((await states.get(ACME))?.status).toBe('paused');
  });

  it('makes an active company overdue when a payment fails, and writes to it', async () => {
    await states.save(state({ status: 'active', pausedAt: null }));
    const outcome = await applyPaymentFact(deps, ACME, {
      kind: 'payment_failed',
      owesAnything: true,
    });
    expect(outcome).toEqual({ moved: 'overdue', emailed: true });
    expect(sent[0]?.subject).toBe('Payment for Acme Haulage on WagonWise is overdue');
  });

  it('copes with a company that does not exist', async () => {
    expect(
      await applyPaymentFact(deps, makeId<'CompanyId'>('nope'), {
        kind: 'paid_in_full',
        owesAnything: false,
      }),
    ).toEqual({ moved: null, emailed: false });
  });
});

describe('the automatic rules with payment details on file', () => {
  const ended = (): AccountState =>
    state({ status: 'trial', trialEndsOn: '2026-11-30', pausedAt: null });

  it('make a finished free period active, with no email: billing starts', async () => {
    await states.save(ended());
    detailsOnFile = true;
    const done = await runAccountRules(deps);
    expect(done).toMatchObject({ moved: 1, emailed: 0 });
    expect((await states.get(ACME))?.status).toBe('active');
    expect(states.moves[0]?.note).toContain('payment details are on file');
    expect(sent).toEqual([]);
  });

  it('make it overdue as before when none are on file', async () => {
    await states.save(ended());
    detailsOnFile = false;
    await runAccountRules(deps);
    expect((await states.get(ACME))?.status).toBe('overdue');
  });
});
