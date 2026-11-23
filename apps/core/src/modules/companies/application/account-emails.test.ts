import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { Actor, FleetUser, PlatformStaff } from '../domain/staff-account.js';
import {
  deliverAccountEmail,
  sendAccountEmailByHand,
  type AccountEmailDeps,
} from './account-emails.js';
import { InMemoryAccountEmailLog } from './testing/in-memory-account-email-log.js';
import { InMemoryAccountStateRepository } from './testing/in-memory-account-state-repository.js';
import { InMemoryCompanyRepository } from './testing/in-memory-company-repository.js';
import { InMemoryStaffAccountRepository } from './testing/in-memory-staff-repositories.js';

const ACME = makeId<'CompanyId'>('company-acme');
const ADMIN = makeId<'StaffId'>('admin');
const platform: Actor = { kind: 'platform', staffId: ADMIN };

interface Sent {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

let sent: Sent[];
let notices: { subject: string; text: string }[];
let failFor: Set<string>;
let states: InMemoryAccountStateRepository;
let log: InMemoryAccountEmailLog;
let accounts: InMemoryStaffAccountRepository;
let deps: AccountEmailDeps;
let clock: FakeClock;

function fleetUser(id: string, email: string, privileges: FleetUser['privileges']): FleetUser {
  return {
    kind: 'fleet',
    id: makeId<'StaffId'>(id),
    email,
    name: id,
    companyId: ACME,
    privileges,
    secondFactorMethod: 'totp',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const credentials = (id: string) => ({
  staffId: makeId<'StaffId'>(id),
  passwordHash: 'x',
  secondFactor: { method: 'totp' as const, secretCiphertext: 'x' },
});

async function addFleetUser(id: string, email: string, privileges: FleetUser['privileges']) {
  await accounts.create(fleetUser(id, email, privileges), credentials(id));
}

beforeEach(async () => {
  sent = [];
  notices = [];
  failFor = new Set();
  clock = new FakeClock('2026-12-01T09:00:00.000Z');
  states = new InMemoryAccountStateRepository();
  log = new InMemoryAccountEmailLog();
  accounts = new InMemoryStaffAccountRepository();
  const companies = new InMemoryCompanyRepository();
  await companies.save({
    id: ACME,
    name: 'Acme Haulage',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    photoRetentionMonths: 12,
  });
  const admin: PlatformStaff = {
    kind: 'platform',
    id: ADMIN,
    email: 'owner@wagonwise.test',
    name: 'Owner',
    secondFactorMethod: 'totp',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  await accounts.create(admin, credentials('admin'));
  await addFleetUser('boss', 'boss@acme.test', ['manage_users', 'manage_billing']);
  await addFleetUser('dispatcher', 'dispatch@acme.test', ['dispatch']);
  await states.save({
    companyId: ACME,
    status: 'trial',
    trialEndsOn: '2026-12-15',
    overdueSince: null,
    pausedAt: null,
    note: '',
    hold: false,
  });
  deps = {
    states,
    companies,
    accounts,
    emailLog: log,
    mailer: {
      send: (to, subject, text) => {
        if (failFor.has(to)) return Promise.reject(new Error('mailbox full'));
        sent.push({ to, subject, text });
        return Promise.resolve();
      },
    },
    ownerNotice: {
      send: (subject, text) => {
        notices.push({ subject, text });
        return Promise.resolve();
      },
    },
    dashboardUrl: 'https://portal.example.com',
    clock,
  };
});

describe('deliverAccountEmail', () => {
  it('writes to the people who hold billing, and not to everyone', async () => {
    const result = await deliverAccountEmail(deps, ACME, 'trial_14');
    expect(result).toEqual({ ok: true, value: { sent: 1, alreadySent: false } });
    expect(sent.map((s) => s.to)).toEqual(['boss@acme.test']);
    expect(sent[0]?.subject).toContain('15 December 2026');
  });

  it('falls back to the people who manage users when nobody holds billing', async () => {
    await accounts.save(fleetUser('boss', 'boss@acme.test', ['manage_users']));
    await deliverAccountEmail(deps, ACME, 'trial_14');
    expect(sent.map((s) => s.to)).toEqual(['boss@acme.test']);
  });

  it('says so when there is nobody to write to, and sends and logs nothing', async () => {
    await accounts.save(fleetUser('boss', 'boss@acme.test', ['dispatch']));
    expect(await deliverAccountEmail(deps, ACME, 'trial_14')).toEqual({
      ok: false,
      error: { tag: 'NoRecipients' },
    });
    expect(sent).toEqual([]);
    expect(log.rows.size).toBe(0);
  });

  it('never sends the same email twice for the same occasion', async () => {
    await deliverAccountEmail(deps, ACME, 'trial_14');
    const again = await deliverAccountEmail(deps, ACME, 'trial_14');
    expect(again).toEqual({ ok: true, value: { sent: 0, alreadySent: true } });
    expect(sent).toHaveLength(1);
  });

  it('writes again for a later occasion: a company that goes overdue a second time', async () => {
    await states.save({
      companyId: ACME,
      status: 'overdue',
      trialEndsOn: null,
      overdueSince: new Date('2026-12-01T00:00:00Z'),
      pausedAt: null,
      note: '',
      hold: false,
    });
    await deliverAccountEmail(deps, ACME, 'overdue');
    await states.save({
      companyId: ACME,
      status: 'overdue',
      trialEndsOn: null,
      overdueSince: new Date('2027-02-01T00:00:00Z'),
      pausedAt: null,
      note: '',
      hold: false,
    });
    const second = await deliverAccountEmail(deps, ACME, 'overdue');
    expect(second).toEqual({ ok: true, value: { sent: 1, alreadySent: false } });
    expect(sent).toHaveLength(2);
  });

  it('refuses an email about a state the company is not in', async () => {
    expect(await deliverAccountEmail(deps, ACME, 'paused')).toEqual({
      ok: false,
      error: { tag: 'WrongState' },
    });
    expect(await deliverAccountEmail(deps, ACME, 'overdue')).toEqual({
      ok: false,
      error: { tag: 'WrongState' },
    });
    expect(sent).toEqual([]);
  });

  it('says the pause day in the overdue email, from the grace period', async () => {
    await states.save({
      companyId: ACME,
      status: 'overdue',
      trialEndsOn: null,
      overdueSince: new Date('2026-12-01T00:00:00Z'),
      pausedAt: null,
      note: '',
      hold: false,
    });
    await deliverAccountEmail(deps, ACME, 'overdue');
    expect(sent[0]?.text).toContain('15 December 2026');
  });

  it('gives the claim back when every send fails, so it is tried again', async () => {
    failFor.add('boss@acme.test');
    expect(await deliverAccountEmail(deps, ACME, 'trial_14')).toEqual({
      ok: false,
      error: { tag: 'EmailFailed' },
    });
    expect(log.rows.size).toBe(0);
    failFor.clear();
    expect(await deliverAccountEmail(deps, ACME, 'trial_14')).toEqual({
      ok: true,
      value: { sent: 1, alreadySent: false },
    });
  });

  it('keeps the claim when some are reached, and reaches the others', async () => {
    await addFleetUser('second', 'second@acme.test', ['manage_billing']);
    failFor.add('boss@acme.test');
    const result = await deliverAccountEmail(deps, ACME, 'trial_14');
    expect(result).toEqual({ ok: true, value: { sent: 1, alreadySent: false } });
    expect(sent.map((s) => s.to)).toEqual(['second@acme.test']);
    expect(log.rows.size).toBe(1);
    expect([...log.rows.values()][0]?.recipients).toBe(1);
  });

  it('tells the owner who was written to, and still succeeds if that notice fails', async () => {
    await deliverAccountEmail(deps, ACME, 'trial_14');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.subject).toContain('Acme Haulage');
    expect(notices[0]?.text).toContain('boss@acme.test');

    deps = {
      ...deps,
      emailLog: new InMemoryAccountEmailLog(),
      ownerNotice: { send: () => Promise.reject(new Error('down')) },
    };
    expect(await deliverAccountEmail(deps, ACME, 'trial_14')).toEqual({
      ok: true,
      value: { sent: 1, alreadySent: false },
    });
  });

  it('works with no alert address set', async () => {
    deps = { ...deps, ownerNotice: undefined };
    expect(await deliverAccountEmail(deps, ACME, 'trial_14')).toEqual({
      ok: true,
      value: { sent: 1, alreadySent: false },
    });
  });

  it('says a company is not found', async () => {
    expect(await deliverAccountEmail(deps, makeId<'CompanyId'>('nope'), 'trial_14')).toEqual({
      ok: false,
      error: { tag: 'CompanyNotFound' },
    });
  });
});

describe('sendAccountEmailByHand', () => {
  const fleet: Actor = {
    kind: 'fleet',
    staffId: makeId<'StaffId'>('boss'),
    companyId: ACME,
    privileges: ['manage_users', 'manage_billing'],
  };

  it('is for WagonWise staff only', async () => {
    expect(await sendAccountEmailByHand(deps, fleet, ACME, 'trial_14', 'company')).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await sendAccountEmailByHand(deps, fleet, ACME, 'trial_14', 'me')).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(sent).toEqual([]);
  });

  it('writes to the company for real, and logs it', async () => {
    const result = await sendAccountEmailByHand(deps, platform, ACME, 'trial_14', 'company');
    expect(result).toEqual({ ok: true, value: { sent: 1, alreadySent: false } });
    expect(sent.map((s) => s.to)).toEqual(['boss@acme.test']);
    expect(log.rows.size).toBe(1);
  });

  it('sends a test copy to the signed-in member only, for any kind, with nothing logged', async () => {
    // The company is on a trial, and a paused email would be refused for real; a test copy is for the wording.
    const result = await sendAccountEmailByHand(deps, platform, ACME, 'paused', 'me');
    expect(result).toEqual({ ok: true, value: { sent: 1, alreadySent: false } });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('owner@wagonwise.test');
    expect(sent[0]?.subject.startsWith('[Test] ')).toBe(true);
    expect(sent[0]?.subject).toContain('Acme Haulage');
    expect(log.rows.size).toBe(0);
    expect(notices).toEqual([]);
  });

  it('a test copy of a trial email uses dates that fit, not the real ones', async () => {
    await sendAccountEmailByHand(deps, platform, ACME, 'trial_7', 'me');
    expect(sent[0]?.text).toContain('ends in 7 days, on 8 December 2026');
  });
});
