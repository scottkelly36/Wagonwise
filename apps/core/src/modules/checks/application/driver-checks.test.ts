import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { CheckItem, CheckTemplate } from '../domain/check-template.js';
import type { Answer } from '../domain/check.js';
import { attachCheckPhoto, checksDue, submitCheck, type DriverCheckDeps } from './driver-checks.js';
import { InMemoryCheckRepository } from './testing/in-memory-check-repository.js';
import { InMemoryTemplateRepository } from './testing/in-memory-template-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const pat = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000001');
const sam = makeId<'DriverId'>('d0000000-0000-4000-8000-000000000002');
const lorry = makeId<'FleetVehicleId'>('lorry-1');
const trailer = makeId<'FleetVehicleId'>('trailer-1');
const stranger = makeId<'FleetVehicleId'>('their-lorry');
const tId = makeId<'CheckTemplateId'>('t1');
const checkId = makeId<'CheckId'>('check-1');

const items: CheckItem[] = [
  {
    id: 'tyres',
    kind: 'pass_fail',
    label: 'Tyres',
    required: true,
    severity: 'do_not_drive',
    photoOnDefect: true,
  },
  { id: 'notes', kind: 'note', label: 'Notes', required: false },
];
const template = (over: Partial<CheckTemplate> = {}): CheckTemplate => ({
  id: tId,
  companyId: acme,
  name: 'Tractor unit',
  appliesTo: 'all',
  vehicleIds: [],
  items,
  version: 3,
  archivedAt: undefined,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
  updatedAt: new Date('2026-10-01T09:00:00.000Z'),
  ...over,
});
const fine: Answer[] = [{ itemId: 'tyres', value: 'ok' }];

async function setup(onJob: typeof lorry | null = lorry) {
  const templates = new InMemoryTemplateRepository();
  const checks = new InMemoryCheckRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: DriverCheckDeps = {
    templates,
    checks,
    clock,
    ids: new SequentialIdGenerator(),
    vehicles: {
      belongsToCompany: (v, c) => Promise.resolve(v !== stranger && c === acme),
      find: (v) =>
        Promise.resolve(
          v === stranger
            ? { companyId: beta, name: 'Theirs' }
            : { companyId: acme, name: 'Big Wagon' },
        ),
    },
    driverVehicle: {
      currentVehicle: (d) =>
        Promise.resolve(
          d === pat && onJob !== null ? { id: onJob, companyId: acme, name: 'Big Wagon' } : null,
        ),
    },
    membership: { isActiveDriverOfCompany: (d, c) => Promise.resolve(c === acme && d !== sam) },
  };
  await templates.save(template());
  return { deps, checks, clock, templates };
}

const submission = (over = {}) => ({
  id: checkId,
  templateId: tId,
  vehicleId: lorry,
  answers: fine,
  completedAt: undefined,
  ...over,
});

describe('checksDue', () => {
  it('lists the lists for the vehicle on the driver’s job, not done yet', async () => {
    const { deps } = await setup();
    const due = await checksDue(deps, pat);
    expect(due.vehicle).toEqual({ id: lorry, name: 'Big Wagon' });
    expect(due.lists.map((l) => [l.template.name, l.doneToday])).toEqual([['Tractor unit', false]]);
  });

  it('has nothing for a driver with no job or no vehicle', async () => {
    const { deps } = await setup(null);
    expect(await checksDue(deps, pat)).toEqual({ vehicle: null, lists: [] });
  });

  it('leaves out lists meant for other vehicles, and archived ones', async () => {
    const { deps, templates } = await setup();
    await templates.save(
      template({
        id: makeId<'CheckTemplateId'>('t2'),
        name: 'Trailer',
        appliesTo: 'selected',
        vehicleIds: [trailer],
      }),
    );
    await templates.save(
      template({
        id: makeId<'CheckTemplateId'>('t3'),
        name: 'Old',
        archivedAt: new Date('2026-10-02T09:00:00.000Z'),
      }),
    );
    const due = await checksDue(deps, pat);
    expect(due.lists.map((l) => l.template.name)).toEqual(['Tractor unit']);
  });

  it('counts a list as done once anyone has done it on that vehicle today, and not tomorrow', async () => {
    const { deps, clock } = await setup();
    await submitCheck(deps, pat, submission());
    expect((await checksDue(deps, pat)).lists[0]?.doneToday).toBe(true);
    clock.set('2026-10-10T09:00:00.000Z');
    expect((await checksDue(deps, pat)).lists[0]?.doneToday).toBe(false);
  });
});

describe('submitCheck', () => {
  it('files a clear check with the questions as they were, today’s UK day, and no defects', async () => {
    const { deps, checks } = await setup();
    const result = await submitCheck(deps, pat, submission());
    expect(result.ok && result.value).toMatchObject({
      result: 'clear',
      templateVersion: 3,
      templateName: 'Tractor unit',
      vehicleName: 'Big Wagon',
      checkDay: '2026-10-09',
      driverId: pat,
    });
    expect(result.ok && result.value.items).toEqual(items);
    expect(await checks.findById(checkId)).not.toBeNull();
    expect(checks.defectIds.get(checkId)).toEqual([]);
  });

  it('records a defect and its note, and the worst severity as the result', async () => {
    const { deps, checks } = await setup();
    const result = await submitCheck(
      deps,
      pat,
      submission({ answers: [{ itemId: 'tyres', value: 'defect', note: 'Bald' }] }),
    );
    expect(result.ok && result.value.result).toBe('do_not_drive');
    expect(result.ok && result.value.defects[0]).toMatchObject({ itemId: 'tyres', note: 'Bald' });
    expect(checks.defectIds.get(checkId)).toHaveLength(1);
  });

  it('keeps when the phone says it was finished, which may be before it arrived', async () => {
    const { deps } = await setup();
    const completedAt = new Date('2026-10-09T05:55:00.000Z');
    const result = await submitCheck(deps, pat, submission({ completedAt }));
    expect(result.ok && result.value.deviceCompletedAt).toEqual(completedAt);
  });

  it('answers a retry with the check already made, and files nothing twice', async () => {
    const { deps, checks } = await setup();
    await submitCheck(deps, pat, submission());
    const again = await submitCheck(
      deps,
      pat,
      submission({ answers: [{ itemId: 'tyres', value: 'defect' }] }),
    );
    expect(again.ok && again.value.result).toBe('clear');
    expect(checks.defectIds.get(checkId)).toEqual([]);
  });

  it('refuses another driver’s id, a driver outside the company, and an archived or unknown list', async () => {
    const { deps } = await setup();
    await submitCheck(deps, pat, submission());
    expect(await submitCheck(deps, sam, submission())).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await submitCheck(deps, sam, submission({ id: makeId<'CheckId'>('other') }))).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(
      await submitCheck(
        deps,
        pat,
        submission({ id: makeId<'CheckId'>('x'), templateId: makeId<'CheckTemplateId'>('nope') }),
      ),
    ).toEqual({ ok: false, error: { tag: 'TemplateNotFound' } });
  });

  it('refuses a vehicle that is not the company’s, and a list not meant for that vehicle', async () => {
    const { deps, templates } = await setup();
    expect(await submitCheck(deps, pat, submission({ vehicleId: stranger }))).toEqual({
      ok: false,
      error: { tag: 'VehicleNotInCompany' },
    });
    await templates.save(template({ appliesTo: 'selected', vehicleIds: [trailer] }));
    expect(await submitCheck(deps, pat, submission())).toEqual({
      ok: false,
      error: { tag: 'TemplateNotForVehicle' },
    });
  });

  it('refuses answers that do not fit the questions, and files nothing', async () => {
    const { deps, checks } = await setup();
    const result = await submitCheck(deps, pat, submission({ answers: [] }));
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidAnswers', reason: 'missing_answer', itemId: 'tyres' },
    });
    expect(await checks.findById(checkId)).toBeNull();
  });
});

describe('attachCheckPhoto', () => {
  const photo = { contentType: 'image/jpeg', dataBase64: 'AAAA' };

  it('stores a photo for a defect that asks for one, and replaces it on a retake', async () => {
    const { deps, checks } = await setup();
    await submitCheck(deps, pat, submission({ answers: [{ itemId: 'tyres', value: 'defect' }] }));
    expect((await attachCheckPhoto(deps, pat, checkId, 'tyres', photo)).ok).toBe(true);
    await attachCheckPhoto(deps, pat, checkId, 'tyres', { ...photo, dataBase64: 'BBBB' });
    expect(checks.photos.get(`${checkId}/tyres`)?.dataBase64).toBe('BBBB');
  });

  it('refuses a photo where none was asked for', async () => {
    const { deps } = await setup();
    await submitCheck(deps, pat, submission());
    expect(await attachCheckPhoto(deps, pat, checkId, 'tyres', photo)).toEqual({
      ok: false,
      error: { tag: 'NoPhotoWanted' },
    });
    expect(await attachCheckPhoto(deps, pat, checkId, 'ghost', photo)).toEqual({
      ok: false,
      error: { tag: 'NoPhotoWanted' },
    });
  });

  it('hides another driver’s check, and an unknown one', async () => {
    const { deps } = await setup();
    await submitCheck(deps, pat, submission({ answers: [{ itemId: 'tyres', value: 'defect' }] }));
    expect(await attachCheckPhoto(deps, sam, checkId, 'tyres', photo)).toEqual({
      ok: false,
      error: { tag: 'CheckNotFound' },
    });
    expect(await attachCheckPhoto(deps, pat, makeId<'CheckId'>('nope'), 'tyres', photo)).toEqual({
      ok: false,
      error: { tag: 'CheckNotFound' },
    });
  });
});
