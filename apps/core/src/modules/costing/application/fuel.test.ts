import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { MAX_IMPORT_ROWS, type FuelRowInput } from '../domain/fuel.js';
import {
  assignVehicle,
  importFuel,
  listFuel,
  listImports,
  listUnmatched,
  rematchFuel,
  undoImport,
  type FuelDeps,
} from './fuel.js';
import type { StaffCaller, VehicleSummary } from './ports.js';
import { InMemoryFuelRepository } from './testing/in-memory-fuel.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const van = makeId<'FleetVehicleId'>('van');
const lorry = makeId<'FleetVehicleId'>('lorry');
const theirs = makeId<'FleetVehicleId'>('theirs');

const manager: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_fleet'] };
const reporter: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['view_reports'] };
const dispatcher: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const outsider: StaffCaller = { kind: 'fleet', companyId: beta, privileges: ['manage_fleet'] };
const admin: StaffCaller = { kind: 'platform' };

const row = (over: Partial<FuelRowInput> = {}): FuelRowInput => ({
  occurredAt: '2026-10-05T08:30:00.000Z',
  registration: 'ab12 cde',
  litres: 200,
  amountPence: 30_000,
  ...over,
});

function setup() {
  const fuel = new InMemoryFuelRepository();
  const list: VehicleSummary[] = [
    { id: van, name: 'Van', registration: 'AB12CDE' },
    { id: lorry, name: 'Lorry', registration: undefined },
  ];
  const deps: FuelDeps = {
    fuel,
    vehicles: {
      listForCompany: (c) => Promise.resolve(c === acme ? list : []),
      find: (v) => {
        const found = list.find((x) => x.id === v);
        if (found !== undefined) return Promise.resolve({ ...found, companyId: acme });
        return Promise.resolve(
          v === theirs
            ? { id: theirs, name: 'Theirs', registration: undefined, companyId: beta }
            : null,
        );
      },
    },
    ids: new SequentialIdGenerator(),
    clock: new FakeClock('2026-10-09T09:00:00.000Z'),
  };
  return { deps, fuel, list };
}

describe('importFuel', () => {
  it('matches purchases to vehicles by registration (spaces and case ignored) and keeps the ones that match none', async () => {
    const { deps, fuel } = setup();
    const result = await importFuel(deps, manager, staffId, acme, 'oct.csv', [
      row(),
      row({
        registration: 'XY99 ZZZ',
        amountPence: 12_000,
        occurredAt: '2026-10-06T08:00:00.000Z',
      }),
    ]);
    expect(result.ok && result.value).toMatchObject({
      imported: 2,
      duplicates: 0,
      invalid: [],
      matched: 1,
      unmatched: 1,
      unmatchedRegistrations: ['XY99ZZZ'],
    });
    const stored = [...fuel.transactions.values()];
    expect(stored.find((t) => t.registration === 'AB12CDE')?.vehicleId).toBe(van);
    expect(stored.find((t) => t.registration === 'XY99ZZZ')?.vehicleId).toBeUndefined();
    expect(fuel.imports.size).toBe(1);
  });

  it('adds nothing when the same statement is sent again, and records no empty import', async () => {
    const { deps, fuel } = setup();
    const rows = [row(), row({ amountPence: 5_000, occurredAt: '2026-10-07T10:00:00.000Z' })];
    await importFuel(deps, manager, staffId, acme, 'oct.csv', rows);
    const again = await importFuel(deps, manager, staffId, acme, 'oct.csv', rows);
    expect(again.ok && again.value).toMatchObject({
      imported: 0,
      duplicates: 2,
      importId: undefined,
    });
    expect(fuel.transactions.size).toBe(2);
    expect(fuel.imports.size).toBe(1);
  });

  it('keeps two genuinely identical purchases in one file, but not on a second send', async () => {
    const { deps, fuel } = setup();
    const twins = [row(), row()];
    const first = await importFuel(deps, manager, staffId, acme, 'a.csv', twins);
    expect(first.ok && first.value.imported).toBe(2);
    const second = await importFuel(deps, manager, staffId, acme, 'a.csv', twins);
    expect(second.ok && second.value).toMatchObject({ imported: 0, duplicates: 2 });
    expect(fuel.transactions.size).toBe(2);
    // A later statement with a third identical one adds just the third.
    const third = await importFuel(deps, manager, staffId, acme, 'b.csv', [row(), row(), row()]);
    expect(third.ok && third.value).toMatchObject({ imported: 1, duplicates: 2 });
  });

  it('reports rows it cannot read by position and still imports the rest', async () => {
    const { deps } = setup();
    const result = await importFuel(deps, manager, staffId, acme, 'f.csv', [
      row({ occurredAt: 'last tuesday' }),
      row({ amountPence: 0 }),
      row({ registration: '  ' }),
      row({ litres: -4 }),
      row({ amountPence: 20_000_000 }),
      row(),
    ]);
    expect(result.ok && result.value.invalid).toEqual([
      { row: 1, reason: 'bad_date' },
      { row: 2, reason: 'bad_amount' },
      { row: 3, reason: 'no_registration' },
      { row: 4, reason: 'bad_litres' },
      { row: 5, reason: 'bad_amount' },
    ]);
    expect(result.ok && result.value.imported).toBe(1);
  });

  it('takes a credit (a negative amount) and a statement with no litres', async () => {
    const { deps, fuel } = setup();
    await importFuel(deps, manager, staffId, acme, 'c.csv', [
      row({ amountPence: -2_500, litres: undefined }),
    ]);
    expect([...fuel.transactions.values()][0]).toMatchObject({
      amountPence: -2_500,
      litres: undefined,
    });
  });

  it('is for managers and WagonWise, takes a bounded number of rows, and needs at least one', async () => {
    const { deps } = setup();
    for (const caller of [reporter, dispatcher, outsider]) {
      expect(await importFuel(deps, caller, staffId, acme, 'x.csv', [row()])).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    expect((await importFuel(deps, admin, staffId, acme, 'x.csv', [row()])).ok).toBe(true);
    expect(await importFuel(deps, manager, staffId, acme, 'x.csv', [])).toEqual({
      ok: false,
      error: { tag: 'NoRows' },
    });
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row());
    expect(await importFuel(deps, manager, staffId, acme, 'x.csv', many)).toEqual({
      ok: false,
      error: { tag: 'TooManyRows' },
    });
  });
});

describe('listFuel', () => {
  async function stocked() {
    const s = setup();
    await importFuel(s.deps, manager, staffId, acme, 'oct.csv', [
      row({ amountPence: 30_000, litres: 200 }),
      row({ amountPence: 15_000, litres: 100, occurredAt: '2026-10-06T08:00:00.000Z' }),
      row({
        registration: 'XY99ZZZ',
        amountPence: 10_000,
        litres: undefined,
        occurredAt: '2026-10-07T08:00:00.000Z',
      }),
      row({ amountPence: 99_000, occurredAt: '2026-09-20T08:00:00.000Z' }),
    ]);
    return s;
  }
  const from = new Date('2026-10-01T00:00:00.000Z');
  const to = new Date('2026-11-01T00:00:00.000Z');

  it('totals by vehicle for the period, with litres, price per litre and what is unmatched', async () => {
    const { deps } = await stocked();
    const result = await listFuel(deps, manager, acme, from, to);
    if (!result.ok) throw new Error('listFuel');
    expect(result.value.totalPence).toBe(55_000);
    expect(result.value.totalLitres).toBe(300);
    expect(result.value.unmatchedCount).toBe(1);
    expect(result.value.byVehicle).toEqual([
      expect.objectContaining({
        vehicleName: 'Van',
        purchases: 2,
        litres: 300,
        amountPence: 45_000,
        pencePerLitre: 150,
      }),
      expect.objectContaining({
        vehicleName: undefined,
        purchases: 1,
        amountPence: 10_000,
        pencePerLitre: undefined,
      }),
    ]);
    expect(result.value.transactions[0]?.vehicleName).toBeUndefined();
  });

  it('can be read with view_reports, not by a dispatcher alone, nor by another company', async () => {
    const { deps } = await stocked();
    expect((await listFuel(deps, reporter, acme, from, to)).ok).toBe(true);
    for (const caller of [dispatcher, outsider]) {
      expect(await listFuel(deps, caller, acme, from, to)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });
});

describe('matching purchases to vehicles', () => {
  it('matches an unmatched purchase once its registration is added, and by hand', async () => {
    const { deps, fuel, list } = setup();
    await importFuel(deps, manager, staffId, acme, 'f.csv', [
      row({ registration: 'LR22 ABC' }),
      row({ registration: 'ZZ11 ZZZ', amountPence: 7_000 }),
    ]);
    expect((await listUnmatched(deps, manager, acme)).ok).toBe(true);
    expect(await rematchFuel(deps, manager, acme)).toEqual({ ok: true, value: 0 });
    // The firm adds the lorry's registration.
    list[1] = { id: lorry, name: 'Lorry', registration: 'LR22 ABC' };
    expect(await rematchFuel(deps, manager, acme)).toEqual({ ok: true, value: 1 });
    const left = await fuel.listUnmatched(acme);
    expect(left).toHaveLength(1);
    // The other is matched by hand.
    const id = left[0]?.id;
    if (id === undefined) throw new Error('setup');
    expect((await assignVehicle(deps, manager, id, van)).ok).toBe(true);
    expect(await fuel.listUnmatched(acme)).toEqual([]);
    expect((await assignVehicle(deps, manager, id, undefined)).ok).toBe(true);
    expect(await fuel.listUnmatched(acme)).toHaveLength(1);
  });

  it('does not guess when two vehicles share a registration', async () => {
    const { deps, list } = setup();
    list.push({ id: makeId<'FleetVehicleId'>('twin'), name: 'Twin', registration: 'AB12 CDE' });
    const result = await importFuel(deps, manager, staffId, acme, 'f.csv', [row()]);
    expect(result.ok && result.value).toMatchObject({ matched: 0, unmatched: 1 });
  });

  it('refuses another company’s vehicle, hides another company’s purchase, and needs manage_fleet', async () => {
    const { deps, fuel } = setup();
    await importFuel(deps, manager, staffId, acme, 'f.csv', [row({ registration: 'NOPE 1' })]);
    const id = [...fuel.transactions.keys()][0];
    if (id === undefined) throw new Error('setup');
    expect(await assignVehicle(deps, manager, id, theirs)).toEqual({
      ok: false,
      error: { tag: 'VehicleNotFound' },
    });
    expect(await assignVehicle(deps, outsider, id, van)).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect(await assignVehicle(deps, reporter, id, van)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await rematchFuel(deps, reporter, acme)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('imports and undoing one', () => {
  it('lists imports, and undoing one removes its purchases but not another import’s', async () => {
    const { deps, fuel } = setup();
    const a = await importFuel(deps, manager, staffId, acme, 'a.csv', [row()]);
    const b = await importFuel(deps, manager, staffId, acme, 'b.csv', [
      row({ amountPence: 1_000, occurredAt: '2026-10-08T08:00:00.000Z' }),
    ]);
    const listed = await listImports(deps, reporter, acme);
    expect(listed.ok && listed.value).toHaveLength(2);
    if (!a.ok || a.value.importId === undefined) throw new Error('setup');
    expect((await undoImport(deps, manager, a.value.importId)).ok).toBe(true);
    expect(fuel.transactions.size).toBe(1);
    expect(b.ok && fuel.imports.has(b.value.importId as never)).toBe(true);
    // Sent again after being undone, it comes back.
    const again = await importFuel(deps, manager, staffId, acme, 'a.csv', [row()]);
    expect(again.ok && again.value.imported).toBe(1);
  });

  it('is for managers, and hides another company’s import', async () => {
    const { deps } = setup();
    const a = await importFuel(deps, manager, staffId, acme, 'a.csv', [row()]);
    if (!a.ok || a.value.importId === undefined) throw new Error('setup');
    expect(await undoImport(deps, reporter, a.value.importId)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await undoImport(deps, outsider, a.value.importId)).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});
