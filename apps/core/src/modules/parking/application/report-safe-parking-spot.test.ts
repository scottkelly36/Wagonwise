import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { MAX_NOTE_LENGTH, type SafeParkingSpot } from '../domain/safe-parking-spot.js';
import {
  reportSafeParkingSpot,
  type ReportSafeParkingSpotDeps,
  type ReportSafeParkingSpotInput,
} from './report-safe-parking-spot.js';
import { InMemoryParkingRepository } from './testing/in-memory-parking-repository.js';

function buildDeps(overrides: Partial<ReportSafeParkingSpotDeps> = {}): ReportSafeParkingSpotDeps {
  return {
    repo: new InMemoryParkingRepository(),
    clock: new FakeClock('2026-09-27T12:00:00.000Z'),
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
}

function input(overrides: Partial<ReportSafeParkingSpotInput> = {}): ReportSafeParkingSpotInput {
  return {
    id: makeId<'SafeParkingSpotId'>('11111111-1111-4111-8111-111111111111'),
    reporterId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
    location: { lat: 54.9698, lon: -2.1013 },
    note: 'flat layby, room for a 44-tonner',
    ...overrides,
  };
}

describe('reportSafeParkingSpot', () => {
  it('saves and returns a spot with the current time as reportedAt', async () => {
    const deps = buildDeps();
    const result = await reportSafeParkingSpot(deps, input());

    const expected: SafeParkingSpot = {
      id: input().id,
      reporterId: input().reporterId,
      location: input().location,
      note: input().note,
      reportedAt: new Date('2026-09-27T12:00:00.000Z'),
      source: 'driver',
    };
    expect(result).toMatchObject({ ok: true, value: expected });
  });

  it('accepts an undefined note', async () => {
    const deps = buildDeps();
    const result = await reportSafeParkingSpot(deps, input({ note: undefined }));
    expect(result.ok).toBe(true);
  });

  it('rejects a note over the max length and persists nothing', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    const tooLong = 'x'.repeat(MAX_NOTE_LENGTH + 1);

    const result = await reportSafeParkingSpot(deps, input({ note: tooLong }));

    expect(result).toEqual({ ok: false, error: { tag: 'InvalidNote', reason: 'too_long' } });
    expect(await repo.findNearbyLine([input().location], 1000)).toEqual([]);
  });
});

describe('reporting a place that is already on the map', () => {
  const second = {
    id: makeId<'SafeParkingSpotId'>('33333333-3333-4333-8333-333333333333'),
    reporterId: makeId<'DriverId'>('44444444-4444-4444-8444-444444444444'),
  };

  it('adds the report to the spot instead of making a second pin, keeping both notes', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    const clock = deps.clock as FakeClock;
    const first = await reportSafeParkingSpot(deps, input());
    clock.set('2026-09-27T14:00:00.000Z');
    // About 10 metres away: the same lay-by.
    const again = await reportSafeParkingSpot(deps, {
      ...input(),
      ...second,
      location: { lat: 54.96989, lon: -2.1013 },
      note: 'now with a burger van',
    });
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.value.id).toBe(first.value.id);
    expect(again.value).toMatchObject({
      note: 'now with a burger van',
      reporterCount: 2,
      recentNotes: ['now with a burger van', 'flat layby, room for a 44-tonner'],
    });
    expect(again.value.lastReportedAt).toEqual(new Date('2026-09-27T14:00:00.000Z'));
    const nearby = await repo.findNearbyLine([input().location], 500);
    expect(nearby).toHaveLength(1);
  });

  it('makes a new spot for a report further away than the merge radius', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    await reportSafeParkingSpot(deps, input());
    // About 100 metres away.
    await reportSafeParkingSpot(deps, {
      ...input(),
      ...second,
      location: { lat: 54.9707, lon: -2.1013 },
    });
    expect(await repo.findNearbyLine([input().location], 500)).toHaveLength(2);
  });

  it('answers a retry of the same report with the same place, and adds nothing', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    const first = await reportSafeParkingSpot(deps, input());
    const merged = await reportSafeParkingSpot(deps, { ...input(), ...second });
    const retry = await reportSafeParkingSpot(deps, { ...input(), ...second });
    expect(first.ok && merged.ok && retry.ok).toBe(true);
    if (!merged.ok || !retry.ok) return;
    expect(retry.value.id).toBe(merged.value.id);
    expect(retry.value.reporterCount).toBe(2);
  });

  it('undo takes back only that driver’s report, and the spot stays for the others', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    const first = await reportSafeParkingSpot(deps, input());
    await reportSafeParkingSpot(deps, { ...input(), ...second, note: 'second view' });
    expect(await repo.removeReport(second.id, second.reporterId)).toBe(true);
    const left = await repo.find(first.ok ? first.value.id : second.id);
    expect(left).toMatchObject({ reporterCount: 1, note: 'flat layby, room for a 44-tonner' });
  });
});

describe('reporting a place with its details', () => {
  const second = {
    id: makeId<'SafeParkingSpotId'>('33333333-3333-4333-8333-333333333333'),
    reporterId: makeId<'DriverId'>('44444444-4444-4444-8444-444444444444'),
  };
  const details = { name: ' Corbridge Layby ', capacity: 6, toilets: false, lit: true };

  it('puts the name, spaces and facilities on a new spot, tidied', async () => {
    const deps = buildDeps();
    const result = await reportSafeParkingSpot(deps, input({ details }));
    expect(result.ok && result.value).toMatchObject({
      name: 'Corbridge Layby',
      capacity: 6,
      toilets: false,
      lit: true,
      note: 'flat layby, room for a 44-tonner',
    });
  });

  it('refuses an over-long name or a bad number of spaces, and saves nothing', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    for (const [bad, reason] of [
      [{ name: 'x'.repeat(121) }, 'name'],
      [{ capacity: -2 }, 'capacity'],
      [{ capacity: 9000 }, 'capacity'],
      [{ capacity: 2.5 }, 'capacity'],
    ] as const) {
      expect(await reportSafeParkingSpot(deps, input({ details: bad }))).toEqual({
        ok: false,
        error: { tag: 'InvalidSuggestion', reason },
      });
    }
    expect(await repo.findNearbyLine([input().location], 1000)).toEqual([]);
  });

  it('does not rewrite a place already on the map: the details wait for staff as a suggestion', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    await reportSafeParkingSpot(deps, input({ details: { name: 'Old name', capacity: 4 } }));
    const merged = await reportSafeParkingSpot(deps, {
      ...input(),
      ...second,
      location: { lat: 54.96989, lon: -2.1013 },
      details: { name: 'Better name', capacity: 4, showers: true },
    });
    expect(merged.ok && merged.value).toMatchObject({ name: 'Old name', capacity: 4 });
    const waiting = await repo.listSuggestions(10);
    expect(waiting).toHaveLength(1);
    // What already matches is dropped.
    expect(waiting[0]?.suggestion.changes).toEqual({ name: 'Better name', showers: true });
    expect(waiting[0]?.suggestion.suggesterId).toBe(second.reporterId);
  });

  it('files nothing for staff when a report on an existing place carries no details', async () => {
    const repo = new InMemoryParkingRepository();
    const deps = buildDeps({ repo });
    await reportSafeParkingSpot(deps, input());
    await reportSafeParkingSpot(deps, { ...input(), ...second, details: {} });
    expect(await repo.listSuggestions(10)).toEqual([]);
  });
});
