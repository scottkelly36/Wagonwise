import { describe, expect, it } from 'vitest';
import { firstRunSteps, isBrandNew, showFirstRun } from './first-run';

const manager = { canManageFleet: true, canDispatch: true };

describe('firstRunSteps', () => {
  it('offers the three steps, none done, to a new firm', () => {
    const steps = firstRunSteps({ vehicles: 0, activeDrivers: 0, jobs: 0, ...manager });
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ['vehicle', false],
      ['driver', false],
      ['job', false],
    ]);
    expect(showFirstRun(steps)).toBe(true);
  });

  it('ticks each step as its thing exists, and stops showing once all are done', () => {
    const some = firstRunSteps({ vehicles: 1, activeDrivers: 0, jobs: 0, ...manager });
    expect(some.map((s) => s.done)).toEqual([true, false, false]);
    expect(showFirstRun(some)).toBe(true);
    const all = firstRunSteps({ vehicles: 2, activeDrivers: 1, jobs: 5, ...manager });
    expect(showFirstRun(all)).toBe(false);
  });

  it('only offers steps the person can do', () => {
    const dispatcher = firstRunSteps({
      vehicles: 0,
      activeDrivers: 0,
      jobs: 0,
      canManageFleet: false,
      canDispatch: true,
    });
    expect(dispatcher.map((s) => s.key)).toEqual(['job']);
    const viewer = firstRunSteps({
      vehicles: 0,
      activeDrivers: 0,
      jobs: 0,
      canManageFleet: false,
      canDispatch: false,
    });
    expect(viewer).toEqual([]);
    expect(showFirstRun(viewer)).toBe(false);
  });

  it('shows nothing while a count is loading or has failed, so an established firm is never told to get started', () => {
    expect(firstRunSteps({ vehicles: undefined, activeDrivers: 0, jobs: 0, ...manager })).toEqual(
      [],
    );
    expect(firstRunSteps({ vehicles: 0, activeDrivers: undefined, jobs: 0, ...manager })).toEqual(
      [],
    );
    expect(firstRunSteps({ vehicles: 0, activeDrivers: 0, jobs: undefined, ...manager })).toEqual(
      [],
    );
  });
});

describe('isBrandNew', () => {
  it('is true only when there are no vehicles and no jobs, both known', () => {
    expect(isBrandNew({ vehicles: 0, jobs: 0 })).toBe(true);
    expect(isBrandNew({ vehicles: 1, jobs: 0 })).toBe(false);
    expect(isBrandNew({ vehicles: 0, jobs: 3 })).toBe(false);
    expect(isBrandNew({ vehicles: undefined, jobs: 0 })).toBe(false);
  });
});
