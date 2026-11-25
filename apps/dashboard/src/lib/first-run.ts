/**
 * What a firm that has only just started is shown on its home page: three plain steps to a working fleet, each ticked when it is done,
 * instead of a wall of zeros and "all clear". Pure: the page passes in counts it already has. A step is only offered to someone who
 * could do it (vehicles and drivers need "manage vehicles & drivers", jobs need "dispatch"), and nothing is shown while a count is
 * still loading or failed, so a slow page never tells an established firm to get started.
 */
export interface FirstRunStep {
  readonly key: 'vehicle' | 'driver' | 'job';
  readonly title: string;
  readonly detail: string;
  readonly to: string;
  readonly done: boolean;
}

export function firstRunSteps(input: {
  readonly vehicles: number | undefined;
  readonly activeDrivers: number | undefined;
  readonly jobs: number | undefined;
  readonly canManageFleet: boolean;
  readonly canDispatch: boolean;
}): FirstRunStep[] {
  const { vehicles, activeDrivers, jobs } = input;
  if (vehicles === undefined || activeDrivers === undefined || jobs === undefined) return [];
  const steps: FirstRunStep[] = [];
  if (input.canManageFleet) {
    steps.push({
      key: 'vehicle',
      title: 'Add your lorry',
      detail: 'Its height, width, length and weight, once. Every route is planned to fit it.',
      to: '/fleet/vehicle-profiles',
      done: vehicles > 0,
    });
    steps.push({
      key: 'driver',
      title: 'Add your drivers, or yourself',
      detail: 'Give drivers your join code, or add yourself if you drive too.',
      to: '/fleet/drivers',
      done: activeDrivers > 0,
    });
  }
  if (input.canDispatch) {
    steps.push({
      key: 'job',
      title: 'Create your first job',
      detail: 'The stops, a driver and a vehicle. The driver gets it on their phone.',
      to: '/fleet/jobs',
      done: jobs > 0,
    });
  }
  return steps;
}

/** Shown while any step is still to do. */
export const showFirstRun = (steps: readonly FirstRunStep[]): boolean =>
  steps.some((step) => !step.done);

/** Nothing set up at all: the home page leads with the steps and leaves out the empty tiles and panels. */
export const isBrandNew = (input: {
  readonly vehicles: number | undefined;
  readonly jobs: number | undefined;
}): boolean => input.vehicles === 0 && input.jobs === 0;
