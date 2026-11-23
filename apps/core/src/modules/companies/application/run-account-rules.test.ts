import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { AccountState } from '../domain/account-state.js';
import type { CompanyId } from '../domain/company.js';
import type { FleetUser } from '../domain/staff-account.js';
import { runAccountRules, type AccountRuleDeps } from './run-account-rules.js';
import { InMemoryAccountEmailLog } from './testing/in-memory-account-email-log.js';
import { InMemoryAccountStateRepository } from './testing/in-memory-account-state-repository.js';
import { InMemoryCompanyRepository } from './testing/in-memory-company-repository.js';
import { InMemoryStaffAccountRepository } from './testing/in-memory-staff-repositories.js';

const ACME = makeId<'CompanyId'>('company-acme');
const BETA = makeId<'CompanyId'>('company-beta');

let sent: { to: string; subject: string }[];
let notices: string[];
let states: InMemoryAccountStateRepository;
let accounts: InMemoryStaffAccountRepository;
let log: InMemoryAccountEmailLog;
let clock: FakeClock;
let deps: AccountRuleDeps;

const credentials = (id: string) => ({
  staffId: makeId<'StaffId'>(id),
  passwordHash: 'x',
  secondFactor: { method: 'totp' as const, secretCiphertext: 'x' },
});

async function addBoss(companyId: CompanyId, email: string) {
  const user: FleetUser = {
    kind: 'fleet',
    id: makeId<'StaffId'>(`boss-${companyId}`),
    email,
    name: 'Boss',
    companyId,
    privileges: ['manage_users', 'manage_billing'],
    secondFactorMethod: 'totp',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  await accounts.create(user, credentials(user.id));
}

const state = (companyId: CompanyId, over: Partial<AccountState>): AccountState => ({
  companyId,
  status: 'trial',
  trialEndsOn: null,
  overdueSince: null,
  pausedAt: null,
  note: '',
  hold: false,
  ...over,
});

const setAutomation = (automation: 'off' | 'no_pause' | 'full') => {
  states.settings = { ...states.settings, automation };
};
const statusOf = async (id: CompanyId) => (await states.get(id))?.status;

beforeEach(async () => {
  sent = [];
  notices = [];
  clock = new FakeClock('2026-12-01T09:00:00.000Z'); // 9am UK in winter
  states = new InMemoryAccountStateRepository();
  accounts = new InMemoryStaffAccountRepository();
  log = new InMemoryAccountEmailLog();
  const companies = new InMemoryCompanyRepository();
  for (const [id, name] of [
    [ACME, 'Acme Haulage'],
    [BETA, 'Beta Freight'],
  ] as const) {
    await companies.save({
      id,
      name,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      photoRetentionMonths: 12,
    });
  }
  await addBoss(ACME, 'boss@acme.test');
  await addBoss(BETA, 'boss@beta.test');
  setAutomation('full');
  deps = {
    states,
    companies,
    accounts,
    emailLog: log,
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
    dashboardUrl: undefined,
    clock,
    ids: new SequentialIdGenerator(),
    scoped: (work) => work(),
  };
});

describe('runAccountRules: when it does nothing', () => {
  it('does nothing while the setting is off', async () => {
    setAutomation('off');
    await states.save(state(ACME, { trialEndsOn: '2026-11-01' }));
    expect(await runAccountRules(deps)).toEqual({
      moved: 0,
      emailed: 0,
      nobodyToWrite: 0,
      failed: 0,
    });
    expect(await statusOf(ACME)).toBe('trial');
    expect(sent).toEqual([]);
  });

  it('does nothing before 7am UK, and does it once 7am has come', async () => {
    clock = new FakeClock('2026-12-01T05:30:00.000Z');
    deps = { ...deps, clock };
    await states.save(state(ACME, { trialEndsOn: '2026-12-10' }));
    expect((await runAccountRules(deps)).emailed).toBe(0);
    clock.advance(2 * 60 * 60 * 1000);
    expect((await runAccountRules(deps)).emailed).toBe(1);
  });

  it('leaves a company with the hold alone, and active and hand-paused companies', async () => {
    await states.save(state(ACME, { trialEndsOn: '2026-11-01', hold: true }));
    await states.save(state(BETA, { status: 'paused', pausedAt: new Date('2026-11-01') }));
    const done = await runAccountRules(deps);
    expect(done).toEqual({ moved: 0, emailed: 0, nobodyToWrite: 0, failed: 0 });
    expect(sent).toEqual([]);
    expect(await statusOf(ACME)).toBe('trial');
  });
});

describe('runAccountRules: a trial', () => {
  it('writes once when the end is two weeks away, not again on the next pass', async () => {
    await states.save(state(ACME, { trialEndsOn: '2026-12-14' }));
    expect((await runAccountRules(deps)).emailed).toBe(1);
    expect((await runAccountRules(deps)).emailed).toBe(0);
    expect(sent.map((s) => s.to)).toEqual(['boss@acme.test']);
    expect(sent[0]?.subject).toContain('14 December 2026');
  });

  it('is quiet while the end is further off', async () => {
    await states.save(state(ACME, { trialEndsOn: '2027-02-20' }));
    expect(await runAccountRules(deps)).toMatchObject({ moved: 0, emailed: 0 });
  });

  it('makes a company overdue the day after its last free day, writes to it, logs it as the system and tells the owner', async () => {
    await states.save(state(ACME, { trialEndsOn: '2026-11-30' }));
    const done = await runAccountRules(deps);
    expect(done).toMatchObject({ moved: 1, emailed: 1 });
    expect(await statusOf(ACME)).toBe('overdue');
    expect(sent[0]?.subject).toBe('Payment for Acme Haulage on WagonWise is overdue');
    expect(states.moves).toHaveLength(1);
    expect(states.moves[0]).toMatchObject({ from: 'trial', to: 'overdue', byStaffId: null });
    expect(states.moves[0]?.note).toContain('Automatic');
    expect(notices).toContain('WagonWise moved Acme Haulage to overdue by itself');
  });

  it('does not move a company that has a trial still running on its last day', async () => {
    await states.save(state(ACME, { trialEndsOn: '2026-12-01' }));
    await runAccountRules(deps);
    expect(await statusOf(ACME)).toBe('trial');
  });
});

describe('runAccountRules: an overdue company', () => {
  const overdueSince = (day: string) => new Date(`${day}T09:00:00Z`);

  it('is reminded a week in', async () => {
    await states.save(state(ACME, { status: 'overdue', overdueSince: overdueSince('2026-11-23') }));
    await runAccountRules(deps);
    expect(sent[0]?.subject).toContain('Reminder');
  });

  it('is paused after the grace period, told, and the owner is told', async () => {
    await states.save(state(ACME, { status: 'overdue', overdueSince: overdueSince('2026-11-17') }));
    const done = await runAccountRules(deps);
    expect(done).toMatchObject({ moved: 1, emailed: 1 });
    const now = await states.get(ACME);
    expect(now?.status).toBe('paused');
    expect(now?.pausedAt).not.toBeNull();
    expect(sent.map((s) => s.subject)).toEqual([
      'The WagonWise account for Acme Haulage has been paused',
    ]);
    expect(states.moves[0]).toMatchObject({ from: 'overdue', to: 'paused', byStaffId: null });
    expect(notices).toContain('WagonWise moved Acme Haulage to paused by itself');
  });

  it('then leaves a paused company alone on the next pass', async () => {
    await states.save(state(ACME, { status: 'overdue', overdueSince: overdueSince('2026-11-17') }));
    await runAccountRules(deps);
    sent.length = 0;
    expect(await runAccountRules(deps)).toMatchObject({ moved: 0, emailed: 0 });
    expect(sent).toEqual([]);
  });

  it('is never paused when the setting is on but never pause, and its email does not promise a pause', async () => {
    setAutomation('no_pause');
    await states.save(state(ACME, { status: 'overdue', overdueSince: overdueSince('2026-11-17') }));
    await runAccountRules(deps);
    expect(await statusOf(ACME)).toBe('overdue');
    expect(sent[0]?.subject).toContain('Reminder');
  });

  it('can still be moved from a finished trial when never pause is on', async () => {
    setAutomation('no_pause');
    await states.save(state(ACME, { trialEndsOn: '2026-11-30' }));
    await runAccountRules(deps);
    expect(await statusOf(ACME)).toBe('overdue');
  });
});

describe('runAccountRules: when things go wrong', () => {
  it('still pauses a company nobody can be written to, and says so in the count', async () => {
    const lonely = makeId<'CompanyId'>('company-lonely');
    await deps.companies.findById(ACME); // keep the in-memory companies in use
    await (deps.companies as InMemoryCompanyRepository).save({
      id: lonely,
      name: 'Lonely Ltd',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      photoRetentionMonths: 12,
    });
    await states.save(
      state(lonely, { status: 'overdue', overdueSince: new Date('2026-11-01T09:00:00Z') }),
    );
    const done = await runAccountRules(deps);
    expect(done).toMatchObject({ moved: 1, emailed: 0, nobodyToWrite: 1 });
    expect(await statusOf(lonely)).toBe('paused');
  });

  it('one company failing does not stop the others', async () => {
    await states.save(state(ACME, { trialEndsOn: '2026-12-10' }));
    await states.save(state(BETA, { trialEndsOn: '2026-12-10' }));
    const real = accounts.listByCompany.bind(accounts);
    accounts.listByCompany = (companyId) =>
      companyId === ACME ? Promise.reject(new Error('boom')) : real(companyId);
    const done = await runAccountRules(deps);
    expect(done).toMatchObject({ failed: 1, emailed: 1 });
    expect(sent.map((s) => s.to)).toEqual(['boss@beta.test']);
  });

  it('a failed notice to the owner does not undo a move', async () => {
    deps = { ...deps, ownerNotice: { send: () => Promise.reject(new Error('down')) } };
    await states.save(state(ACME, { trialEndsOn: '2026-11-30' }));
    await runAccountRules(deps);
    expect(await statusOf(ACME)).toBe('overdue');
  });
});
