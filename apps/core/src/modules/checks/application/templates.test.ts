import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { CheckItem, TemplateInput } from '../domain/check-template.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryTemplateRepository } from './testing/in-memory-template-repository.js';
import {
  archiveTemplate,
  createTemplate,
  listTemplates,
  starterTemplate,
  updateTemplate,
  type TemplateDeps,
} from './templates.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const lorry = makeId<'FleetVehicleId'>('lorry-acme');
const theirs = makeId<'FleetVehicleId'>('lorry-beta');
const t1 = makeId<'CheckTemplateId'>('t1');

const builder: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_fleet'] };
const viewer: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const outsider: StaffCaller = { kind: 'fleet', companyId: beta, privileges: ['manage_fleet'] };
const admin: StaffCaller = { kind: 'platform' };

const tyres: CheckItem = {
  id: 'tyres',
  kind: 'pass_fail',
  label: 'Tyres',
  required: true,
  severity: 'do_not_drive',
  photoOnDefect: true,
};
const input: TemplateInput = {
  name: 'Tractor unit',
  appliesTo: 'all',
  vehicleIds: [],
  items: [tyres],
};

function setup() {
  const templates = new InMemoryTemplateRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: TemplateDeps = {
    templates,
    clock,
    ids: new SequentialIdGenerator(),
    vehicles: { belongsToCompany: (v, c) => Promise.resolve(v === lorry && c === acme) },
  };
  return { deps, templates, clock };
}

describe('createTemplate', () => {
  it('lets a fleet manager build a list, starting at version 1', async () => {
    const { deps, templates } = setup();
    const result = await createTemplate(deps, builder, { ...input, id: t1, companyId: acme });
    expect(result.ok && result.value).toMatchObject({ name: 'Tractor unit', version: 1 });
    expect(await templates.findById(t1)).not.toBeNull();
  });

  it('refuses anyone without manage_fleet, and another company’s staff', async () => {
    const { deps, templates } = setup();
    for (const caller of [viewer, outsider]) {
      expect(await createTemplate(deps, caller, { ...input, id: t1, companyId: acme })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    expect(await templates.findById(t1)).toBeNull();
  });

  it('lets a WagonWise admin build one for any company', async () => {
    const { deps } = setup();
    expect((await createTemplate(deps, admin, { ...input, id: t1, companyId: beta })).ok).toBe(
      true,
    );
  });

  it('refuses a vehicle that is not the company’s', async () => {
    const { deps } = setup();
    const selected: TemplateInput = { ...input, appliesTo: 'selected', vehicleIds: [theirs] };
    expect(await createTemplate(deps, builder, { ...selected, id: t1, companyId: acme })).toEqual({
      ok: false,
      error: { tag: 'VehicleNotInCompany' },
    });
    const own: TemplateInput = { ...input, appliesTo: 'selected', vehicleIds: [lorry] };
    expect((await createTemplate(deps, builder, { ...own, id: t1, companyId: acme })).ok).toBe(
      true,
    );
  });

  it('refuses an invalid list', async () => {
    const { deps } = setup();
    const result = await createTemplate(deps, builder, {
      ...input,
      items: [],
      id: t1,
      companyId: acme,
    });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidTemplate', reason: 'no_items' },
    });
  });

  it('returns the same list for a retry with the same id, and refuses an id that is another company’s', async () => {
    const { deps, templates } = setup();
    await createTemplate(deps, builder, { ...input, id: t1, companyId: acme });
    const again = await createTemplate(deps, builder, {
      ...input,
      name: 'Changed',
      id: t1,
      companyId: acme,
    });
    expect(again.ok && again.value.name).toBe('Tractor unit');
    expect(await createTemplate(deps, outsider, { ...input, id: t1, companyId: beta })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await templates.findById(t1))?.companyId).toBe(acme);
  });
});

describe('listTemplates', () => {
  it('shows the company’s lists to its staff and to WagonWise, and nobody else', async () => {
    const { deps } = setup();
    await createTemplate(deps, builder, { ...input, id: t1, companyId: acme });
    for (const caller of [viewer, builder, admin]) {
      const result = await listTemplates(deps, caller, acme);
      expect(result.ok && result.value).toHaveLength(1);
    }
    expect(await listTemplates(deps, outsider, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('updateTemplate', () => {
  it('raises the version each time and keeps when it was made', async () => {
    const { deps, clock } = setup();
    const made = await createTemplate(deps, builder, { ...input, id: t1, companyId: acme });
    clock.set('2026-10-10T09:00:00.000Z');
    const result = await updateTemplate(deps, builder, t1, { ...input, name: 'Tractor unit v2' });
    expect(result.ok && result.value).toMatchObject({ name: 'Tractor unit v2', version: 2 });
    if (!made.ok || !result.ok) throw new Error('setup failed');
    expect(result.value.createdAt).toEqual(made.value.createdAt);
    const third = await updateTemplate(deps, builder, t1, input);
    expect(third.ok && third.value.version).toBe(3);
  });

  it('hides another company’s list as not found, and refuses a viewer', async () => {
    const { deps } = setup();
    await createTemplate(deps, builder, { ...input, id: t1, companyId: acme });
    expect(await updateTemplate(deps, outsider, t1, input)).toEqual({
      ok: false,
      error: { tag: 'TemplateNotFound' },
    });
    expect(await updateTemplate(deps, viewer, t1, input)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await updateTemplate(deps, builder, makeId<'CheckTemplateId'>('nope'), input)).toEqual({
      ok: false,
      error: { tag: 'TemplateNotFound' },
    });
  });
});

describe('archiveTemplate', () => {
  it('hides a list from the company’s lists but keeps it', async () => {
    const { deps, templates } = setup();
    await createTemplate(deps, builder, { ...input, id: t1, companyId: acme });
    expect((await archiveTemplate(deps, builder, t1)).ok).toBe(true);
    const listed = await listTemplates(deps, builder, acme);
    expect(listed.ok && listed.value).toEqual([]);
    expect((await templates.findById(t1))?.archivedAt).toBeDefined();
    // Once archived it cannot be edited or archived again.
    expect(await updateTemplate(deps, builder, t1, input)).toEqual({
      ok: false,
      error: { tag: 'TemplateNotFound' },
    });
  });

  it('refuses a viewer and an outsider', async () => {
    const { deps } = setup();
    await createTemplate(deps, builder, { ...input, id: t1, companyId: acme });
    expect(await archiveTemplate(deps, viewer, t1)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await archiveTemplate(deps, outsider, t1)).toEqual({
      ok: false,
      error: { tag: 'TemplateNotFound' },
    });
  });
});

describe('starterTemplate', () => {
  it('gives an example list with fresh ids each time', () => {
    const { deps } = setup();
    const a = starterTemplate(deps);
    const b = starterTemplate(deps);
    expect(a.name).toBe('Daily walk-round check');
    expect(a.items.length).toBeGreaterThan(10);
    expect(a.items[0]?.id).not.toBe(b.items[0]?.id);
  });
});
