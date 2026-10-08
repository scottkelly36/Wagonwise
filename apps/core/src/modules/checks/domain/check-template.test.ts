import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  appliesToVehicle,
  validateTemplate,
  type CheckItem,
  type TemplateInput,
} from './check-template.js';
import { starterItems } from './starter-template.js';

const tyres: CheckItem = {
  id: 'tyres',
  kind: 'pass_fail',
  label: 'Tyres',
  required: true,
  severity: 'do_not_drive',
  photoOnDefect: true,
};
const base: TemplateInput = {
  name: 'Tractor unit',
  appliesTo: 'all',
  vehicleIds: [],
  items: [tyres],
};
const van = makeId<'FleetVehicleId'>('van-1');
const lorry = makeId<'FleetVehicleId'>('lorry-1');

describe('validateTemplate', () => {
  it('accepts a sound list and trims its text', () => {
    const result = validateTemplate({
      ...base,
      name: '  Tractor unit ',
      items: [{ ...tyres, label: '  Tyres  ', help: '   ' }],
    });
    expect(result.ok && result.value.name).toBe('Tractor unit');
    expect(result.ok && result.value.items[0]).toMatchObject({ label: 'Tyres', help: undefined });
  });

  it('refuses a blank or overlong name, and a list with no questions or too many', () => {
    const reasons = (input: TemplateInput) => {
      const r = validateTemplate(input);
      return r.ok ? 'ok' : r.error.reason;
    };
    expect(reasons({ ...base, name: '  ' })).toBe('name');
    expect(reasons({ ...base, name: 'x'.repeat(81) })).toBe('name');
    expect(reasons({ ...base, items: [] })).toBe('no_items');
    const many = Array.from({ length: 61 }, (_, i) => ({ ...tyres, id: `q${i}` }));
    expect(reasons({ ...base, items: many })).toBe('too_many_items');
  });

  it('names the question that is blank, or whose id repeats', () => {
    expect(validateTemplate({ ...base, items: [{ ...tyres, label: ' ' }] })).toEqual({
      ok: false,
      error: { tag: 'InvalidTemplate', reason: 'bad_item', itemId: 'tyres' },
    });
    expect(validateTemplate({ ...base, items: [tyres, { ...tyres, label: 'Lights' }] })).toEqual({
      ok: false,
      error: { tag: 'InvalidTemplate', reason: 'duplicate_item_ids', itemId: 'tyres' },
    });
  });

  it('refuses a number whose minimum is above its maximum', () => {
    const number: CheckItem = {
      id: 'psi',
      kind: 'number',
      label: 'Tyre pressure',
      required: true,
      min: 100,
      max: 80,
      severity: 'advisory',
    };
    const result = validateTemplate({ ...base, items: [number] });
    expect(result.ok).toBe(false);
    expect(validateTemplate({ ...base, items: [{ ...number, min: 80, max: 100 }] }).ok).toBe(true);
    expect(validateTemplate({ ...base, items: [{ ...number, min: Number.NaN }] }).ok).toBe(false);
  });

  it('needs vehicles when the list is for selected vehicles, and drops them when it is for all', () => {
    expect(validateTemplate({ ...base, appliesTo: 'selected', vehicleIds: [] })).toEqual({
      ok: false,
      error: { tag: 'InvalidTemplate', reason: 'no_vehicles_selected' },
    });
    const selected = validateTemplate({ ...base, appliesTo: 'selected', vehicleIds: [van, van] });
    expect(selected.ok && selected.value.vehicleIds).toEqual([van]);
    const all = validateTemplate({ ...base, appliesTo: 'all', vehicleIds: [van] });
    expect(all.ok && all.value.vehicleIds).toEqual([]);
  });
});

describe('appliesToVehicle', () => {
  it('covers every vehicle for "all", and only the named ones for "selected"', () => {
    expect(appliesToVehicle({ appliesTo: 'all', vehicleIds: [] }, van)).toBe(true);
    expect(appliesToVehicle({ appliesTo: 'selected', vehicleIds: [van] }, van)).toBe(true);
    expect(appliesToVehicle({ appliesTo: 'selected', vehicleIds: [van] }, lorry)).toBe(false);
  });
});

describe('starterItems', () => {
  it('is itself a valid list, with a different id for every question', () => {
    let n = 0;
    const items = starterItems(() => `q${++n}`);
    expect(items.length).toBeGreaterThan(10);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(validateTemplate({ ...base, items }).ok).toBe(true);
  });

  it('treats a brake, steering, tyre or lights defect as do-not-drive by default', () => {
    const items = starterItems(() => crypto.randomUUID());
    for (const word of ['Brakes', 'Steering', 'Tyres', 'Lights']) {
      const item = items.find((i) => i.label.startsWith(word));
      expect(item && 'severity' in item && item.severity).toBe('do_not_drive');
    }
  });
});
