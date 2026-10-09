import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { StaffCaller } from './ports/directories.js';
import type { DefectInfo } from './ports/repairs.js';
import {
  bookRepair,
  cancelRepair,
  completeRepair,
  listRepairs,
  type RepairDeps,
} from './repairs.js';
import { InMemoryDefectDirectory, InMemoryRepairRepository } from './testing/in-memory-repairs.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');

const booker: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_maintenance'] };
const dispatcher: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const outsider: StaffCaller = {
  kind: 'fleet',
  companyId: beta,
  privileges: ['manage_maintenance'],
};
const admin: StaffCaller = { kind: 'platform' };

const defect = (over: Partial<DefectInfo> = {}): DefectInfo => ({
  id: 'd1',
  companyId: acme,
  vehicleId: 'lorry-1',
  vehicleName: 'Big Wagon',
  label: 'Tyres',
  detail: 'Flagged as a defect',
  severity: 'do_not_drive',
  status: 'open',
  ...over,
});

function setup() {
  const repairs = new InMemoryRepairRepository();
  const defects = new InMemoryDefectDirectory();
  defects.add(defect());
  defects.add(defect({ id: 'd2', label: 'Wipers', severity: 'advisory', status: 'acknowledged' }));
  defects.add(defect({ id: 'd3', status: 'fixed' }));
  defects.add(defect({ id: 'theirs', companyId: beta }));
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: RepairDeps = { repairs, defects, clock, ids: new SequentialIdGenerator() };
  return { deps, repairs, defects, clock };
}

describe('bookRepair', () => {
  it('books a repair for a defect, with its words kept, and marks the defect seen', async () => {
    const { deps, defects } = setup();
    const result = await bookRepair(deps, booker, staffId, {
      defectId: 'd1',
      dueDate: '2026-10-14',
    });
    expect(result.ok && result.value).toMatchObject({
      defectId: 'd1',
      vehicleName: 'Big Wagon',
      title: 'Tyres: Flagged as a defect',
      severity: 'do_not_drive',
      dueDate: '2026-10-14',
      status: 'open',
    });
    expect(defects.statusChanges).toEqual([{ defectId: 'd1', status: 'acknowledged', staffId }]);
  });

  it('leaves a defect already seen as it is, and returns the repair already booked rather than a second', async () => {
    const { deps, defects } = setup();
    const first = await bookRepair(deps, booker, staffId, {
      defectId: 'd2',
      dueDate: '2026-10-14',
    });
    const again = await bookRepair(deps, booker, staffId, {
      defectId: 'd2',
      dueDate: '2026-10-30',
    });
    expect(defects.statusChanges).toEqual([]);
    expect(again.ok && first.ok && again.value.id).toBe(first.ok ? first.value.id : '');
    expect(again.ok && again.value.dueDate).toBe('2026-10-14');
  });

  it('refuses a defect already fixed, a day in the past, and a day that is not one', async () => {
    const { deps } = setup();
    expect(
      await bookRepair(deps, booker, staffId, { defectId: 'd3', dueDate: '2026-10-14' }),
    ).toEqual({
      ok: false,
      error: { tag: 'DefectAlreadyFixed' },
    });
    expect(
      await bookRepair(deps, booker, staffId, { defectId: 'd1', dueDate: '2026-10-08' }),
    ).toEqual({
      ok: false,
      error: { tag: 'InvalidRepair', reason: 'due_in_past' },
    });
    expect((await bookRepair(deps, booker, staffId, { defectId: 'd1', dueDate: 'soon' })).ok).toBe(
      false,
    );
    expect(
      (await bookRepair(deps, booker, staffId, { defectId: 'd1', dueDate: '2026-10-09' })).ok,
    ).toBe(true);
  });

  it('is for whoever keeps maintenance (or WagonWise), and hides another company’s defect', async () => {
    const { deps } = setup();
    expect(
      await bookRepair(deps, dispatcher, staffId, { defectId: 'd1', dueDate: '2026-10-14' }),
    ).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(
      await bookRepair(deps, outsider, staffId, { defectId: 'd1', dueDate: '2026-10-14' }),
    ).toEqual({
      ok: false,
      error: { tag: 'DefectNotFound' },
    });
    expect(
      await bookRepair(deps, booker, staffId, { defectId: 'theirs', dueDate: '2026-10-14' }),
    ).toEqual({
      ok: false,
      error: { tag: 'DefectNotFound' },
    });
    expect(
      await bookRepair(deps, booker, staffId, { defectId: 'nope', dueDate: '2026-10-14' }),
    ).toEqual({
      ok: false,
      error: { tag: 'DefectNotFound' },
    });
    expect(
      (await bookRepair(deps, admin, staffId, { defectId: 'd1', dueDate: '2026-10-14' })).ok,
    ).toBe(true);
  });
});

describe('completeRepair', () => {
  async function booked() {
    const s = setup();
    const r = await bookRepair(s.deps, booker, staffId, { defectId: 'd1', dueDate: '2026-10-14' });
    if (!r.ok) throw new Error('setup');
    s.defects.statusChanges.length = 0;
    return { ...s, id: r.value.id };
  }

  it('finishes it and marks the defect fixed, which releases the vehicle', async () => {
    const { deps, defects, id } = await booked();
    const done = await completeRepair(deps, booker, staffId, id, {
      doneOn: '2026-10-08',
      note: ' New tyre fitted ',
      markDefectFixed: true,
    });
    expect(done.ok && done.value).toMatchObject({
      status: 'done',
      doneOn: '2026-10-08',
      note: 'New tyre fitted',
    });
    expect(defects.statusChanges).toEqual([{ defectId: 'd1', status: 'fixed', staffId }]);
  });

  it('can finish the job and leave the defect open, for when the repair did not cure it', async () => {
    const { deps, defects, id } = await booked();
    await completeRepair(deps, booker, staffId, id, { markDefectFixed: false });
    expect(defects.statusChanges).toEqual([]);
  });

  it('takes today as the day done, and refuses a day to come', async () => {
    const { deps, id } = await booked();
    expect(
      await completeRepair(deps, booker, staffId, id, {
        doneOn: '2026-10-10',
        markDefectFixed: true,
      }),
    ).toEqual({
      ok: false,
      error: { tag: 'InvalidRepair', reason: 'done_in_future' },
    });
    const done = await completeRepair(deps, booker, staffId, id, { markDefectFixed: true });
    expect(done.ok && done.value.doneOn).toBe('2026-10-09');
  });

  it('cannot be finished twice, or after it was cancelled', async () => {
    const { deps, id } = await booked();
    await completeRepair(deps, booker, staffId, id, { markDefectFixed: true });
    expect(await completeRepair(deps, booker, staffId, id, { markDefectFixed: true })).toEqual({
      ok: false,
      error: { tag: 'RepairNotOpen', status: 'done' },
    });
  });

  it('is for whoever keeps maintenance, and hides another company’s repair', async () => {
    const { deps, id } = await booked();
    expect(await completeRepair(deps, dispatcher, staffId, id, { markDefectFixed: true })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await completeRepair(deps, outsider, staffId, id, { markDefectFixed: true })).toEqual({
      ok: false,
      error: { tag: 'RepairNotFound' },
    });
  });
});

describe('cancelRepair and listRepairs', () => {
  it('cancels one booked in error, leaving the defect alone, and lets another be booked', async () => {
    const { deps, defects } = setup();
    const r = await bookRepair(deps, booker, staffId, { defectId: 'd1', dueDate: '2026-10-14' });
    if (!r.ok) throw new Error('setup');
    defects.statusChanges.length = 0;
    expect((await cancelRepair(deps, booker, staffId, r.value.id)).ok).toBe(true);
    expect(defects.statusChanges).toEqual([]);
    expect(await cancelRepair(deps, booker, staffId, r.value.id)).toEqual({
      ok: false,
      error: { tag: 'RepairNotOpen', status: 'cancelled' },
    });
    const again = await bookRepair(deps, booker, staffId, {
      defectId: 'd1',
      dueDate: '2026-10-20',
    });
    expect(again.ok && again.value.id).not.toBe(r.value.id);
  });

  it('lists the ones still to do, soonest first, and everyone who may see maintenance can read them', async () => {
    const { deps } = setup();
    await bookRepair(deps, booker, staffId, { defectId: 'd2', dueDate: '2026-10-20' });
    await bookRepair(deps, booker, staffId, { defectId: 'd1', dueDate: '2026-10-12' });
    const open = await listRepairs(deps, dispatcher, acme);
    expect(open.ok && open.value.map((r) => r.defectId)).toEqual(['d1', 'd2']);
    expect(await listRepairs(deps, outsider, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('shows finished ones when asked', async () => {
    const { deps } = setup();
    const r = await bookRepair(deps, booker, staffId, { defectId: 'd1', dueDate: '2026-10-12' });
    if (!r.ok) throw new Error('setup');
    await completeRepair(deps, booker, staffId, r.value.id, { markDefectFixed: true });
    const open = await listRepairs(deps, booker, acme, 'open');
    const done = await listRepairs(deps, booker, acme, 'done');
    expect(open.ok && open.value).toEqual([]);
    expect(done.ok && done.value).toHaveLength(1);
  });
});
