import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  advanceStatus,
  assignJobToDriver,
  cancelJob,
  failJob,
  hasProof,
  nextStatus,
  nextStopFor,
  proofStopFor,
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
    currentStop: 0,
    proofStops: [],
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
      stopIndex: 1,
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
    expect(nextStopFor({ ...job('loaded'), currentStop: 1 })).toBe(delivery);
  });

  it('is nothing for an accepted job with no pickup, where there is nowhere to go yet', () => {
    expect(nextStopFor(job('accepted', [delivery]))).toBeUndefined();
    expect(nextStopFor(job('loaded', [delivery]))).toBe(delivery);
  });
});

describe('a job with several stops', () => {
  const farm: JobStop = { kind: 'pickup', name: 'Farm', location: { lat: 54.9, lon: -2.1 } };
  const quarry: JobStop = { kind: 'pickup', name: 'Quarry', location: { lat: 54.95, lon: -2.05 } };
  const mart: JobStop = { kind: 'delivery', name: 'Mart', location: { lat: 55, lon: -2 } };
  const depot: JobStop = { kind: 'delivery', name: 'Depot', location: { lat: 55.1, lon: -1.9 } };

  function walk(stops: JobStop[]): { statuses: JobStatus[]; stopAt: number[]; end: Job } {
    let current = job('assigned', stops);
    const statuses: JobStatus[] = [];
    const stopAt: number[] = [];
    for (let guard = 0; guard < 40; guard++) {
      const to = nextStatus(current);
      if (to === undefined) break;
      const r = advanceStatus(current, to, t(guard + 1));
      if (!r.ok) throw new Error('walk stuck at ' + current.status);
      current = r.value;
      statuses.push(current.status);
      stopAt.push(current.currentStop);
    }
    return { statuses, stopAt, end: current };
  }

  it('walks collect, deliver, deliver: each stop is arrived at and finished, and the load stays on between', () => {
    const { statuses, stopAt, end } = walk([farm, mart, depot]);
    expect(statuses).toEqual([
      'accepted',
      'at_pickup',
      'loaded',
      'en_route',
      'at_delivery',
      'loaded', // delivered the first drop, still carrying the rest
      'en_route',
      'at_delivery',
      'delivered',
    ]);
    // The stop moves on when one is finished, and is past the end once delivered.
    expect(stopAt).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3]);
    expect(end.status).toBe('delivered');
  });

  it('walks two collections then a delivery', () => {
    const { statuses } = walk([farm, quarry, mart]);
    expect(statuses).toEqual([
      'accepted',
      'at_pickup',
      'loaded',
      'en_route',
      'at_pickup', // the second collection
      'loaded',
      'en_route',
      'at_delivery',
      'delivered',
    ]);
  });

  it('a one-pickup, one-delivery job behaves as it always did', () => {
    expect(walk([farm, mart]).statuses).toEqual([
      'accepted',
      'at_pickup',
      'loaded',
      'en_route',
      'at_delivery',
      'delivered',
    ]);
  });

  it('heads for the current stop, and tells the stop that was finished in the timeline', () => {
    const atFirstDrop = { ...job('en_route', [farm, mart, depot]), currentStop: 1 };
    expect(nextStopFor(atFirstDrop)).toBe(mart);
    const arrived = advanceStatus(atFirstDrop, 'at_delivery', t(1));
    const done = arrived.ok ? advanceStatus(arrived.value, 'loaded', t(2)) : arrived;
    expect(done.ok && done.value.currentStop).toBe(2);
    expect(done.ok && done.value.timeline.at(-1)?.stopIndex).toBe(1);
    expect(done.ok && nextStopFor(done.value)).toBe(depot);
  });

  it('wants a photo for each delivery, and says whether the one in hand is there', () => {
    const base = { ...job('at_delivery', [farm, mart, depot]), currentStop: 1 };
    expect(proofStopFor(base)).toBe(1);
    expect(hasProof({ ...base, proofStops: [] })).toBe(false);
    expect(hasProof({ ...base, proofStops: [2] })).toBe(false);
    expect(hasProof({ ...base, proofStops: [1] })).toBe(true);
    const delivered = { ...base, status: 'delivered' as const, currentStop: 3 };
    expect(hasProof({ ...delivered, proofStops: [1] })).toBe(false);
    expect(hasProof({ ...delivered, proofStops: [1, 2] })).toBe(true);
  });

  it('limits how many stops a job can have', () => {
    const many = Array.from({ length: 21 }, () => mart);
    expect(validateStops(many)).toEqual({
      ok: false,
      error: { tag: 'InvalidStops', reason: 'too_many' },
    });
  });
});
