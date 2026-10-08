import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { CheckTemplate } from '../domain/check-template.js';
import type { CheckDetail } from '../domain/office.js';
import {
  getCheckSettings,
  jobStartVerdict,
  updateCheckSettings,
  type CheckRulesDeps,
} from './check-rules.js';
import { DEFAULT_SETTINGS } from '../domain/settings.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryCheckRepository } from './testing/in-memory-check-repository.js';
import { InMemoryOfficeCheckRepository } from './testing/in-memory-office-check-repository.js';
import { InMemorySettingsRepository } from './testing/in-memory-settings-repository.js';
import { InMemoryTemplateRepository } from './testing/in-memory-template-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const lorry = makeId<'FleetVehicleId'>('lorry-1');
const trailer = makeId<'FleetVehicleId'>('trailer-1');

const manager: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_fleet'] };
const viewer: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const outsider: StaffCaller = { kind: 'fleet', companyId: beta, privileges: ['manage_fleet'] };
const admin: StaffCaller = { kind: 'platform' };

const list = (id: string, over: Partial<CheckTemplate> = {}): CheckTemplate => ({
  id: makeId<'CheckTemplateId'>(id),
  companyId: acme,
  name: `List ${id}`,
  appliesTo: 'all',
  vehicleIds: [],
  items: [{ id: 'q', kind: 'note', label: 'Notes', required: false }],
  version: 1,
  archivedAt: undefined,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
  updatedAt: new Date('2026-10-01T09:00:00.000Z'),
  ...over,
});

function setup() {
  const settings = new InMemorySettingsRepository();
  const templates = new InMemoryTemplateRepository();
  const checks = new InMemoryCheckRepository();
  const office = new InMemoryOfficeCheckRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: CheckRulesDeps = { settings, templates, checks, office, clock };
  return { deps, settings, templates, checks, office, clock };
}

async function doneToday(
  checks: InMemoryCheckRepository,
  templateId: string,
  vehicleId: typeof lorry,
) {
  await checks.save(
    {
      id: makeId<'CheckId'>(`c-${templateId}`),
      companyId: acme,
      templateId: makeId<'CheckTemplateId'>(templateId),
      templateVersion: 1,
      templateName: 'x',
      vehicleId,
      vehicleName: 'x',
      driverId: makeId<'DriverId'>('d1'),
      checkDay: '2026-10-09',
      items: [],
      answers: [],
      result: 'clear',
      defects: [],
      submittedAt: new Date('2026-10-09T08:00:00.000Z'),
      deviceCompletedAt: undefined,
    },
    [],
  );
}

describe('settings', () => {
  it('start with both off, and a fleet manager can turn them on', async () => {
    const { deps } = setup();
    expect(await getCheckSettings(deps, viewer, acme)).toEqual({
      ok: true,
      value: { requiredBeforeJob: false, blockOnDoNotDrive: false, retentionMonths: 12 },
    });
    const changed = await updateCheckSettings(deps, manager, staffId, acme, {
      requiredBeforeJob: true,
      blockOnDoNotDrive: false,
    });
    expect(changed.ok && changed.value.requiredBeforeJob).toBe(true);
    const read = await getCheckSettings(deps, viewer, acme);
    expect(read.ok && read.value.requiredBeforeJob).toBe(true);
  });

  it('lets WagonWise staff change any company’s, and records who', async () => {
    const { deps, settings } = setup();
    await updateCheckSettings(deps, admin, staffId, beta, {
      requiredBeforeJob: true,
      blockOnDoNotDrive: true,
    });
    expect(settings.lastChangedBy).toBe(staffId);
  });

  it('refuses anyone but a fleet manager to change them, and other companies to read them', async () => {
    const { deps } = setup();
    const on = { requiredBeforeJob: true, blockOnDoNotDrive: true };
    for (const caller of [viewer, outsider]) {
      expect(await updateCheckSettings(deps, caller, staffId, acme, on)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    expect(await getCheckSettings(deps, outsider, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('jobStartVerdict', () => {
  it('lets everything through for a firm that has turned nothing on, without looking anything up', async () => {
    const { deps, templates } = setup();
    await templates.save(list('a'));
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('ok');
  });

  it('wants every list for the vehicle done today when the firm asks for it', async () => {
    const { deps, settings, templates, checks } = setup();
    await settings.save(
      acme,
      { ...DEFAULT_SETTINGS, requiredBeforeJob: true, blockOnDoNotDrive: false },
      staffId,
    );
    await templates.save(list('a'));
    await templates.save(list('b'));
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('check_required');
    await doneToday(checks, 'a', lorry);
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('check_required');
    await doneToday(checks, 'b', lorry);
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('ok');
  });

  it('counts only the lists meant for this vehicle, and a check on another vehicle does not help', async () => {
    const { deps, settings, templates, checks } = setup();
    await settings.save(
      acme,
      { ...DEFAULT_SETTINGS, requiredBeforeJob: true, blockOnDoNotDrive: false },
      staffId,
    );
    await templates.save(list('trailer-only', { appliesTo: 'selected', vehicleIds: [trailer] }));
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('ok');
    expect(await jobStartVerdict(deps, acme, trailer)).toBe('check_required');
    await doneToday(checks, 'trailer-only', lorry);
    expect(await jobStartVerdict(deps, acme, trailer)).toBe('check_required');
  });

  it('is not asked tomorrow for a check done today', async () => {
    const { deps, settings, templates, checks, clock } = setup();
    await settings.save(
      acme,
      { ...DEFAULT_SETTINGS, requiredBeforeJob: true, blockOnDoNotDrive: false },
      staffId,
    );
    await templates.save(list('a'));
    await doneToday(checks, 'a', lorry);
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('ok');
    clock.set('2026-10-10T09:00:00.000Z');
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('check_required');
  });

  it('holds back a vehicle with an unfixed do-not-drive defect until the office marks it fixed', async () => {
    const { deps, settings, office } = setup();
    await settings.save(
      acme,
      { ...DEFAULT_SETTINGS, requiredBeforeJob: false, blockOnDoNotDrive: true },
      staffId,
    );
    const detail: CheckDetail = {
      id: makeId<'CheckId'>('c1'),
      companyId: acme,
      templateId: makeId<'CheckTemplateId'>('a'),
      templateVersion: 1,
      templateName: 'x',
      vehicleId: lorry,
      vehicleName: 'Big Wagon',
      driverId: makeId<'DriverId'>('d1'),
      checkDay: '2026-10-09',
      items: [],
      answers: [],
      result: 'do_not_drive',
      photoItemIds: [],
      submittedAt: new Date('2026-10-09T08:00:00.000Z'),
      deviceCompletedAt: undefined,
      defects: [
        {
          id: 'd1',
          checkId: makeId<'CheckId'>('c1'),
          companyId: acme,
          vehicleId: lorry,
          vehicleName: 'Big Wagon',
          itemId: 'tyres',
          label: 'Tyres',
          severity: 'do_not_drive',
          detail: 'Flagged as a defect',
          note: undefined,
          status: 'open',
          createdAt: new Date('2026-10-09T08:00:00.000Z'),
          statusChangedAt: undefined,
          statusChangedBy: undefined,
        },
      ],
    };
    office.add(detail);
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('vehicle_not_fit');
    expect(await jobStartVerdict(deps, acme, trailer)).toBe('ok');
    await office.setDefectStatus('d1', 'acknowledged', staffId, new Date());
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('vehicle_not_fit');
    await office.setDefectStatus('d1', 'fixed', staffId, new Date());
    expect(await jobStartVerdict(deps, acme, lorry)).toBe('ok');
  });
});
