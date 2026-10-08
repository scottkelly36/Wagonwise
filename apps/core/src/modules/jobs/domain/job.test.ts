import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  advanceStatus,
  assignJobToDriver,
  cancelJob,
  failJob,
  nextStopFor,
  validateStops,
  type Job,
  type JobStatus,
  type JobStop,
} from './job.js';

const t = (n: number) => new Date(Date.UTC(2026, 9, 1, n));
const driverId = makeId<'DriverId'>('d1');
const vehicleId = makeId<'FleetVehicleId'>('v1');

const pickup: JobStop = { kind: 'pickup', name: 'Farm', location: { lat: 54.9, lon: -2.1 } };
const delivery: JobStop = { kind: 'delivery', name: 'Mart', location: { lat: 55, lon: -2 } };

function job(status: JobStatus = 'draft', stops: readonly JobStop[] = [pickup, delivery]): Job {
  return {
    id: makeId<'JobId'>('j1'),
    companyId: makeId<'CompanyId'>('c1'),
    reference: 'JOB-1',
    stops,
    status,
    timeline: [{ status: 'draft', at: t(0) }],
    requiresProofOfDelivery: false,
    hasProofOfDelivery: false,
  };
}

describe('assignJobToDriver', () => {
  it('moves a draft to assigned, recording driver, vehicle and the time', () => {
    const r = assignJobToDriver(job(), driverId, vehicleId, t(1));
    expect(r.ok && r.value).toMatchObject({ status: 'assigned', driverId, vehicleId });
    expect(r.ok && r.value.timeline.at(-1)).toEqual({ status: 'assigned', at: t(1) });
  });

  it('refuses anything that is not a draft', () => {
    expect(assignJobToDriver(job('assigned'), driverId, vehicleId, t(1))).toEqual({
      ok: false,
      error: { tag: 'InvalidTransition', from: 'assigned', to: 'assigned' },
    });
  });
});

describe('advanceStatus', () => {
  it('walks the whole happy path one step at a time, stamping position when given', () => {
    const path: JobStatus[] = [
      'accepted',
      'at_pickup',
      'loaded',
      'en_route',
      'at_delivery',
      'delivered',
    ];
    let current = job('assigned');
    path.forEach((to, i) => {
      const r = advanceStatus(current, to, t(i + 2), { lat: 54.9, lon: -2.1 });
      expect(r.ok).toBe(true);
      if (r.ok) current = r.value;
    });
    expect(current.status).toBe('delivered');
    expect(current.timeline.at(-1)).toEqual({
      status: 'delivered',
      at: t(7),
      position: { lat: 54.9, lon: -2.1 },
    });
  });

  it('goes straight from accepted to loaded when the job has no pickup', () => {
    const noPickup = job('accepted', [delivery]);
    expect(advanceStatus(noPickup, 'at_pickup', t(1)).ok).toBe(false);
    const loaded = advanceStatus(noPickup, 'loaded', t(1));
    expect(loaded.ok && loaded.value.status).toBe('loaded');
    const rest = ['en_route', 'at_delivery', 'delivered'] as const;
    let current = loaded.ok ? loaded.value : noPickup;
    for (const to of rest) {
      const r = advanceStatus(current, to, t(2));
      expect(r.ok).toBe(true);
      if (r.ok) current = r.value;
    }
    expect(current.status).toBe('delivered');
  });

  it('never skips a step or goes backwards', () => {
    expect(advanceStatus(job('assigned'), 'loaded', t(1)).ok).toBe(false);
    expect(advanceStatus(job('loaded'), 'at_pickup', t(1)).ok).toBe(false);
    expect(advanceStatus(job('delivered'), 'delivered', t(1)).ok).toBe(false);
    expect(advanceStatus(job('draft'), 'accepted', t(1)).ok).toBe(false);
  });
});

describe('cancelJob / failJob', () => {
  it('cancels any unfinished job, but not a finished one', () => {
    for (const s of ['draft', 'assigned', 'en_route', 'at_delivery'] as JobStatus[]) {
      expect(cancelJob(job(s), t(1)).ok).toBe(true);
    }
    for (const s of ['delivered', 'cancelled', 'failed'] as JobStatus[]) {
      expect(cancelJob(job(s), t(1)).ok).toBe(false);
    }
  });

  it('fails only a job that is with a driver', () => {
    expect(failJob(job('en_route'), t(1)).ok).toBe(true);
    expect(failJob(job('draft'), t(1)).ok).toBe(false);
    expect(failJob(job('delivered'), t(1)).ok).toBe(false);
  });
});

describe('validateStops', () => {
  it('needs a delivery, and a pickup is optional', () => {
    expect(validateStops([delivery]).ok).toBe(true);
    expect(validateStops([pickup, delivery]).ok).toBe(true);
    expect(validateStops([pickup])).toEqual({
      ok: false,
      error: { tag: 'InvalidStops', reason: 'no_delivery' },
    });
    expect(validateStops([])).toEqual({
      ok: false,
      error: { tag: 'InvalidStops', reason: 'empty' },
    });
  });
});

describe('nextStopFor', () => {
  it('is the pickup until loaded, then the delivery', () => {
    expect(nextStopFor(job('accepted'))).toBe(pickup);
    expect(nextStopFor(job('loaded'))).toBe(delivery);
  });

  it('is nothing for an accepted job with no pickup, where there is nowhere to go yet', () => {
    expect(nextStopFor(job('accepted', [delivery]))).toBeUndefined();
    expect(nextStopFor(job('loaded', [delivery]))).toBe(delivery);
  });
});
