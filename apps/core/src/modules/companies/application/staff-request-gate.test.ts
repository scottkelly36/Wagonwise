import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import type { AccountState, AccountStatus } from '../domain/account-state.js';
import type { StaffId } from '../domain/staff-account.js';
import { createStaffRequestGate, type GateCaller } from './staff-request-gate.js';
import { InMemoryAccountStateRepository } from './testing/in-memory-account-state-repository.js';

const COMPANY = makeId<'CompanyId'>('company-1');
const FLEET = 'fleet-user';
const ADMIN = 'admin';

function stateOf(status: AccountStatus): AccountState {
  return {
    companyId: COMPANY,
    status,
    trialEndsOn: null,
    overdueSince: null,
    pausedAt: null,
    note: '',
    hold: false,
  };
}

let states: InMemoryAccountStateRepository;
let clock: FakeClock;
let scopes: RecordingDataScopes;
let callerLookups: number;
let gate: ReturnType<typeof createStaffRequestGate>;

beforeEach(() => {
  states = new InMemoryAccountStateRepository();
  clock = new FakeClock();
  scopes = new RecordingDataScopes();
  callerLookups = 0;
  const callers = {
    get(staffId: StaffId): Promise<GateCaller | null> {
      callerLookups += 1;
      if (staffId === ADMIN) return Promise.resolve({ kind: 'platform' });
      if (staffId === FLEET) return Promise.resolve({ kind: 'fleet', companyId: COMPANY });
      return Promise.resolve(null);
    },
  };
  gate = createStaffRequestGate({ callers, states, scopes, clock });
});

describe('the staff request gate', () => {
  it('refuses a paused company a request that changes something', async () => {
    await states.save(stateOf('paused'));
    expect(await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs')).toBe(true);
    expect(await gate(FLEET, 'PUT', '/staff/fleet/vehicles/v')).toBe(true);
    expect(await gate(FLEET, 'DELETE', '/staff/fleet/vehicles/v')).toBe(true);
  });

  it('lets a paused company read, and costs no lookup to do it', async () => {
    await states.save(stateOf('paused'));
    expect(await gate(FLEET, 'GET', '/staff/jobs/companies/c/jobs')).toBe(false);
    expect(callerLookups).toBe(0);
  });

  it('lets a paused company remove a person or resolve an SOS alert', async () => {
    await states.save(stateOf('paused'));
    expect(await gate(FLEET, 'DELETE', '/staff/members/s1')).toBe(false);
    expect(await gate(FLEET, 'POST', '/staff/sos/a1/resolve')).toBe(false);
  });

  it('refuses nothing for a trial, active or overdue company', async () => {
    for (const status of ['trial', 'active', 'overdue'] as const) {
      await states.save(stateOf(status));
      clock.advance(60_000);
      expect(await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs')).toBe(false);
    }
  });

  it('never refuses WagonWise staff, even in a paused company', async () => {
    await states.save(stateOf('paused'));
    expect(await gate(ADMIN, 'POST', '/staff/jobs/companies/c/jobs')).toBe(false);
  });

  it('leaves an unknown account to the route, which answers for itself', async () => {
    await states.save(stateOf('paused'));
    expect(await gate('nobody', 'POST', '/staff/jobs/companies/c/jobs')).toBe(false);
  });

  it('leaves a company that cannot be found to the route', async () => {
    expect(await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs')).toBe(false);
  });

  it('looks the state up in the staff-auth scope, once, then remembers it for a few seconds', async () => {
    await states.save(stateOf('paused'));
    await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs');
    await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs');
    expect(scopes.used).toEqual([{ kind: 'staff-auth' }]);
  });

  it('notices a change after the remembered time has passed', async () => {
    await states.save(stateOf('paused'));
    expect(await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs')).toBe(true);
    await states.save(stateOf('active'));
    clock.advance(6_000);
    expect(await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs')).toBe(false);
    await states.save(stateOf('paused'));
    clock.advance(6_000);
    expect(await gate(FLEET, 'POST', '/staff/jobs/companies/c/jobs')).toBe(true);
  });
});
