import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { CompanyId, Job, JobId } from '../domain/job.js';
import { canDispatch, canViewJobs } from './authorization.js';
import type { Forbidden, JobNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { JobRepository } from './ports/job-repository.js';
import type {
  DriverMessage,
  DriverNotifier,
  JobNotice,
  JobNoticeRepository,
  NoticeResult,
} from './ports/notices.js';

/** The job is not waiting for its driver any more (or has no driver), so there is nothing to send. */
export type NothingToSend = TaggedError<'NothingToSend'>;

export interface NoticeDeps {
  readonly notifier: DriverNotifier;
  readonly notices: JobNoticeRepository;
  readonly clock: Clock;
}

/** What the driver's phone shows: the reference and where the first stop is. */
export function assignmentMessage(job: Job): DriverMessage {
  const first = job.stops[0];
  return {
    title: 'New job assigned',
    body: first === undefined ? job.reference : `${job.reference}: ${first.name}`,
    data: { type: 'job_assigned', jobId: job.id },
  };
}

/**
 * Tells the job's driver, and notes how it went. Never throws: a push that cannot go must not undo an assignment, and
 * the office can see the result and send it again.
 */
export async function sendAssignmentNotice(deps: NoticeDeps, job: Job): Promise<NoticeResult> {
  if (job.driverId === undefined) return 'no_device';
  let result: NoticeResult;
  let devices = 0;
  try {
    const report = await deps.notifier.notify(job.driverId, assignmentMessage(job));
    devices = report.devices;
    result = report.devices === 0 ? 'no_device' : report.accepted > 0 ? 'sent' : 'failed';
  } catch {
    result = 'failed';
  }
  try {
    await deps.notices.record(job.id, result, devices, deps.clock.now());
  } catch {
    // Recording is a convenience for the office; losing it must not fail the assignment either.
  }
  return result;
}

/** The company's jobs that are assigned and waiting for the driver, with how telling them went. */
export async function listNotices(
  deps: Pick<NoticeDeps, 'notices'>,
  caller: Caller,
  companyId: CompanyId,
): Promise<Result<JobNotice[], Forbidden>> {
  if (!canViewJobs(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.notices.listWaiting(companyId));
}

/** Sends the notice again, for a job still waiting for its driver. */
export async function resendNotice(
  deps: NoticeDeps & { readonly repo: Pick<JobRepository, 'findById'> },
  caller: Caller,
  jobId: JobId,
): Promise<Result<JobNotice, Forbidden | JobNotFound | NothingToSend>> {
  const job = await deps.repo.findById(jobId);
  if (job === null || !canViewJobs(caller, job.companyId)) return err({ tag: 'JobNotFound' });
  if (!canDispatch(caller, job.companyId)) return err({ tag: 'Forbidden' });
  if (job.status !== 'assigned' || job.driverId === undefined) {
    return err({ tag: 'NothingToSend' });
  }
  await sendAssignmentNotice(deps, job);
  const notice = await deps.notices.find(job.id);
  return notice === null ? err({ tag: 'JobNotFound' }) : ok(notice);
}

/** The driver opened their job. */
export async function noteSeen(
  deps: Pick<NoticeDeps, 'notices' | 'clock'>,
  job: Job,
): Promise<void> {
  if (job.status === 'assigned') await deps.notices.markSeen(job.id, deps.clock.now());
}
