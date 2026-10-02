import type { DomainEvent } from '../../../shared/domain-event.js';
import type { Job, JobStatus } from './job.js';

/** Design doc §3's job events. Each defines its own payload here, same as hazards' events. */
export interface JobEventPayload {
  readonly jobId: string;
  readonly companyId: string;
  readonly reference: string;
}

export interface JobAssignedPayload extends JobEventPayload {
  readonly driverId: string;
  readonly vehicleId: string;
}

export interface JobStatusChangedPayload extends JobEventPayload {
  readonly from: JobStatus;
  readonly to: JobStatus;
}

function base(job: Job): JobEventPayload {
  return { jobId: job.id, companyId: job.companyId, reference: job.reference };
}

function event<P>(eventId: string, job: Job, eventType: string, payload: P): DomainEvent<P> {
  return { eventId, aggregateType: 'Job', aggregateId: job.id, eventType, payload };
}

export function jobCreatedEvent(eventId: string, job: Job): DomainEvent<JobEventPayload> {
  return event(eventId, job, 'JobCreated', base(job));
}

export function jobAssignedEvent(eventId: string, job: Job): DomainEvent<JobAssignedPayload> {
  return event(eventId, job, 'JobAssigned', {
    ...base(job),
    driverId: job.driverId ?? '',
    vehicleId: job.vehicleId ?? '',
  });
}

export function jobStatusChangedEvent(
  eventId: string,
  job: Job,
  from: JobStatus,
): DomainEvent<JobStatusChangedPayload> {
  return event(eventId, job, 'JobStatusChanged', { ...base(job), from, to: job.status });
}

export function jobCompletedEvent(eventId: string, job: Job): DomainEvent<JobEventPayload> {
  return event(eventId, job, 'JobCompleted', base(job));
}

export function jobCancelledEvent(eventId: string, job: Job): DomainEvent<JobEventPayload> {
  return event(eventId, job, 'JobCancelled', base(job));
}
