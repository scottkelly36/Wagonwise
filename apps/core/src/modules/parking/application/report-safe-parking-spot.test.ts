import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
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
    };
    expect(result).toEqual({ ok: true, value: expected });
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
