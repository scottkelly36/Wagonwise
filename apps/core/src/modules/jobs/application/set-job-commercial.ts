import { err, ok, type Result } from '../../../shared/result.js';
import { validateCommercial, type InvalidCommercial, type Job, type JobId } from '../domain/job.js';
import { canDispatch, canViewJobs } from './authorization.js';
import type { Forbidden, JobNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository } from './ports/job-repository.js';

export interface SetJobCommercialDeps {
  readonly repo: Pick<JobRepository, 'findById' | 'save'>;
}

/**
 * Sets (or clears) who a job is for and what it earns. Whoever can dispatch may, at any stage, since a price is often
 * agreed, or corrected, after the job has gone out; the figures count as revenue only when the job is delivered. `null`
 * clears a field, and a field left out is left as it is.
 */
export async function setJobCommercial(
  deps: SetJobCommercialDeps,
  input: {
    readonly caller: Caller;
    readonly jobId: JobId;
    readonly customer?: string | null | undefined;
    readonly pricePence?: number | null | undefined;
  },
): Promise<Result<Job, Forbidden | JobNotFound | InvalidCommercial>> {
  const job = await deps.repo.findById(input.jobId);
  if (job === null || !canViewJobs(input.caller, job.companyId)) return err({ tag: 'JobNotFound' });
  if (!canDispatch(input.caller, job.companyId)) return err({ tag: 'Forbidden' });

  const next = {
    customer: input.customer === undefined ? job.customer : input.customer,
    pricePence: input.pricePence === undefined ? job.pricePence : input.pricePence,
  };
  const checked = validateCommercial(next);
  if (!checked.ok) return checked;

  const { customer: _c, pricePence: _p, ...rest } = job;
  const updated: Job = {
    ...rest,
    ...(checked.value.customer === undefined ? {} : { customer: checked.value.customer }),
    ...(checked.value.pricePence === undefined ? {} : { pricePence: checked.value.pricePence }),
  };
  await deps.repo.save(updated);
  return ok(updated);
}
