import { describe, expect, it, vi } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Job } from '../domain/job.js';
import type { Caller } from './ports/caller-directory.js';
import { reportJobs } from './report-jobs.js';
import { InMemoryJobRepository } from './testing/in-memory-job-repository.js';

const company = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const other = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const reporter: Caller = { kind: 'fleet', companyId: company, privileges: ['view_reports'] };
const driver = makeId<'DriverId'>('driver-1');
const vehicle = makeId<'FleetVehicleId'>('vehicle-1');

function job(id: string, createdIso: string, overrides: Partial<Job> = {}): Job {
  return {
    id: makeId<'JobId'>(id),
    companyId: company,
    reference: id,
    status: 'draft',
    stops: [
      { kind: 'pickup', name: 'Depot', location: { lat: 54.9, lon: -2.1 } },
      { kind: 'delivery', name: 'Port', location: { lat: 55.0, lon: -1.6 } },
    ],
    timeline: [{ status: 'draft', at: new Date(createdIso) }],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
    ...overrides,
  };
}

async function setup(jobs: Job[]) {
  const repo = new InMemoryJobRepository();
  for (const j of jobs) await repo.save(j);
  const getIdentifier = vi.fn((id: string) =>
    Promise.resolve(id === driver ? 'pat@example.com' : null),
  );
  const getName = vi.fn((id: string) => Promise.resolve(id === vehicle ? 'Big Wagon' : null));
  return {
    deps: { repo, drivers: { getIdentifier }, vehicles: { getName } },
    getIdentifier,
    getName,
  };
}

const window = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') };

describe('reportJobs', () => {
  it('refuses a caller without view_reports, and one from another company', async () => {
    const { deps } = await setup([job('a', '2026-10-05T08:00:00Z')]);
    const dispatcher: Caller = { kind: 'fleet', companyId: company, privileges: ['dispatch'] };
    const outsider: Caller = { kind: 'fleet', companyId: other, privileges: ['view_reports'] };
    for (const caller of [dispatcher, outsider]) {
      expect(await reportJobs(deps, { caller, companyId: company, ...window })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });

  it('lets a WagonWise admin read any company', async () => {
    const { deps } = await setup([job('a', '2026-10-05T08:00:00Z')]);
    const result = await reportJobs(deps, {
      caller: { kind: 'platform' },
      companyId: company,
      ...window,
    });
    expect(result.ok).toBe(true);
  });

  it('keeps jobs with any activity in the period, newest first, and the end is exclusive', async () => {
    const { deps } = await setup([
      job('old', '2026-09-01T08:00:00Z'),
      job('early', '2026-10-02T08:00:00Z'),
      job('late', '2026-10-20T08:00:00Z'),
      // Created before the period, delivered in it: still part of this period's report.
      job('finished-in-period', '2026-09-30T08:00:00Z', {
        status: 'delivered',
        timeline: [
          { status: 'draft', at: new Date('2026-09-30T08:00:00Z') },
          { status: 'delivered', at: new Date('2026-10-03T08:00:00Z') },
        ],
      }),
      job('on-the-boundary', '2026-11-01T00:00:00Z'),
    ]);
    const result = await reportJobs(deps, { caller: reporter, companyId: company, ...window });
    if (!result.ok) throw new Error('expected a report');
    expect(result.value.rows.map((r) => r.reference)).toEqual([
      'late',
      'early',
      'finished-in-period',
    ]);
    expect(result.value.summary.total).toBe(3);
  });

  it('names the driver and vehicle, looking each up once however many jobs they are on', async () => {
    const { deps, getIdentifier, getName } = await setup([
      job('a', '2026-10-05T08:00:00Z', { driverId: driver, vehicleId: vehicle }),
      job('b', '2026-10-06T08:00:00Z', { driverId: driver, vehicleId: vehicle }),
      job('c', '2026-10-07T08:00:00Z'),
    ]);
    const result = await reportJobs(deps, { caller: reporter, companyId: company, ...window });
    if (!result.ok) throw new Error('expected a report');
    const byRef = new Map(result.value.rows.map((r) => [r.reference, r]));
    expect(byRef.get('a')).toMatchObject({ driver: 'pat@example.com', vehicle: 'Big Wagon' });
    expect(byRef.get('c')?.driver).toBeUndefined();
    expect(getIdentifier).toHaveBeenCalledTimes(1);
    expect(getName).toHaveBeenCalledTimes(1);
  });
});
