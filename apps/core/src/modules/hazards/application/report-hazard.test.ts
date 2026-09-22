import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { GeoPoint } from '../domain/hazard-report.js';
import { InMemoryHazardRepository } from './testing/in-memory-hazard-repository.js';
import { reportHazard, type ReportHazardDeps, type ReportHazardInput } from './report-hazard.js';

const reporterId = makeId<'DriverId'>('driver-1');
const location: GeoPoint = { lat: 54.97, lon: -2.1 };

function buildDeps(overrides: Partial<ReportHazardDeps> = {}): ReportHazardDeps {
  return { repo: new InMemoryHazardRepository(), clock: new FakeClock(), ...overrides };
}

function input(overrides: Partial<ReportHazardInput> = {}): ReportHazardInput {
  return {
    id: makeId<'HazardReportId'>('report-1'),
    reporterId,
    type: 'low_bridge',
    location,
    source: 'tap',
    ...overrides,
  };
}

describe('reportHazard', () => {
  it('creates and persists a fresh report', async () => {
    const deps = buildDeps();
    const result = await reportHazard(deps, input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: input().id,
      reporterId,
      type: 'low_bridge',
      location,
      source: 'tap',
      confirmations: 0,
      dismissals: 0,
      status: 'active',
      expiresAt: undefined, // low_bridge is permanent
      createdAt: deps.clock.now(),
    });
    expect(await deps.repo.findById(input().id)).toEqual(result.value);
  });

  it('sets a 7-day expiresAt for a temporary type', async () => {
    const deps = buildDeps();
    const result = await reportHazard(deps, input({ type: 'roadworks' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expiresAt).toEqual(
      new Date(deps.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000),
    );
  });

  it('is idempotent on id — resubmitting the same report returns the existing one, unchanged', async () => {
    const clock = new FakeClock();
    const deps = buildDeps({ clock });
    const first = await reportHazard(deps, input());
    clock.advance(1000);
    const second = await reportHazard(deps, input({ location: { lat: 0, lon: 0 } }));
    expect(second).toEqual(first);
  });

  it('rejects an invalid measurement without persisting anything', async () => {
    const deps = buildDeps();
    const result = await reportHazard(
      deps,
      input({ measurement: { kind: 'height', value: 0, unit: 'm' } }),
    );
    expect(result).toEqual({
      ok: false,
      error: { tag: 'InvalidMeasurement', reason: 'must_be_positive' },
    });
    expect(await deps.repo.findById(input().id)).toBeNull();
  });

  it('merges into a nearby active duplicate as an extra confirmation instead of creating a new report', async () => {
    const deps = buildDeps();
    const existingId = makeId<'HazardReportId'>('existing');
    await reportHazard(deps, input({ id: existingId }));

    const result = await reportHazard(
      deps,
      input({ id: makeId<'HazardReportId'>('report-2'), location: { lat: 54.9701, lon: -2.1 } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(existingId);
    expect(result.value.confirmations).toBe(1);
    // The would-be duplicate itself was never created.
    expect(await deps.repo.findById(makeId<'HazardReportId'>('report-2'))).toBeNull();
  });

  it('does not merge into a report of a different type, however close', async () => {
    const deps = buildDeps();
    await reportHazard(deps, input({ type: 'weight_limit' }));

    const secondId = makeId<'HazardReportId'>('report-2');
    const result = await reportHazard(deps, input({ id: secondId, type: 'low_bridge' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(secondId);
    expect(result.value.confirmations).toBe(0);
  });

  it('does not merge into a report far outside the merge radius', async () => {
    const deps = buildDeps();
    await reportHazard(deps, input());

    const secondId = makeId<'HazardReportId'>('report-2');
    const result = await reportHazard(
      deps,
      input({ id: secondId, location: { lat: 55.5, lon: -1.5 } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(secondId);
    expect(result.value.confirmations).toBe(0);
  });
});
