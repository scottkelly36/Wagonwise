import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import {
  validateCommercial,
  validateReference,
  validateStops,
  type CompanyId,
  type InvalidCommercial,
  type InvalidReference,
  type InvalidStops,
  type Job,
  type JobStop,
} from '../domain/job.js';
import { jobCreatedEvent } from '../domain/events.js';
import { canDispatch } from './authorization.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository } from './ports/job-repository.js';

export interface CreateJobDeps {
  readonly repo: Pick<JobRepository, 'save'>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface CreateJobInput {
  readonly caller: Caller;
  readonly companyId: CompanyId;
  readonly reference: string;
  readonly stops: readonly JobStop[];
  readonly plannedStart?: Date | undefined;
  readonly dueBy?: Date | undefined;
  readonly requiresProofOfDelivery?: boolean | undefined;
  readonly customer?: string | undefined;
  readonly pricePence?: number | undefined;
}

export type CreateJobError = Forbidden | InvalidReference | InvalidStops | InvalidCommercial;

/** Design doc §5 step 1: a dispatcher creates a job with a reference and its stops. It starts
 *  `draft` — no driver, vehicle or route plan until dispatch (not built yet) assigns it. */
export async function createJob(
  deps: CreateJobDeps,
  input: CreateJobInput,
): Promise<Result<Job, CreateJobError>> {
  if (!canDispatch(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  const reference = validateReference(input.reference);
  if (!reference.ok) {
    return reference;
  }
  const stops = validateStops(input.stops);
  if (!stops.ok) {
    return stops;
  }

  const commercial = validateCommercial(input);
  if (!commercial.ok) {
    return commercial;
  }

  const now = deps.clock.now();
  const job: Job = {
    id: makeId<'JobId'>(deps.ids.newId()),
    companyId: input.companyId,
    reference: reference.value,
    stops: stops.value,
    status: 'draft',
    timeline: [{ status: 'draft', at: now }],
    requiresProofOfDelivery: input.requiresProofOfDelivery ?? false,
    currentStop: 0,
    proofStops: [],
    hasProofOfDelivery: false,
    ...(input.plannedStart === undefined ? {} : { plannedStart: input.plannedStart }),
    ...(input.dueBy === undefined ? {} : { dueBy: input.dueBy }),
    ...(commercial.value.customer === undefined ? {} : { customer: commercial.value.customer }),
    ...(commercial.value.pricePence === undefined
      ? {}
      : { pricePence: commercial.value.pricePence }),
  };
  await deps.repo.save(job, [jobCreatedEvent(deps.ids.newId(), job)]);
  return ok(job);
}
