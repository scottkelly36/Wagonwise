import type { Job, JobStatus } from './job.js';

/**
 * One line of the jobs report (P2-M8): what a dispatcher or manager wants to know about a job after
 * the fact, worked out from its status timeline. Pure: no names (those are looked up by the use
 * case), no clock.
 */
export interface JobReportRow {
  readonly jobId: string;
  readonly reference: string;
  readonly status: JobStatus;
  /** The first pickup and the last delivery, which is what a person calls a job. */
  readonly pickup?: string | undefined;
  readonly delivery?: string | undefined;
  readonly driverId?: string | undefined;
  readonly vehicleId?: string | undefined;
  readonly createdAt?: Date | undefined;
  readonly plannedStart?: Date | undefined;
  readonly dueBy?: Date | undefined;
  readonly acceptedAt?: Date | undefined;
  /** When the driver set off for the delivery (`en_route`). */
  readonly setOffAt?: Date | undefined;
  readonly deliveredAt?: Date | undefined;
  /** When the job reached `cancelled` or `failed`, if it did. */
  readonly endedAt?: Date | undefined;
  /** Minutes from the driver accepting the job to delivering it. */
  readonly minutesAcceptedToDelivered?: number | undefined;
  /** Whether a delivered job arrived by its due time. Absent when it was not delivered or had no due time. */
  readonly onTime?: boolean | undefined;
  readonly requiresProofOfDelivery: boolean;
  readonly hasProofOfDelivery: boolean;
}

function firstAt(job: Job, status: JobStatus): Date | undefined {
  return job.timeline.find((entry) => entry.status === status)?.at;
}

export function jobReportRow(job: Job): JobReportRow {
  const acceptedAt = firstAt(job, 'accepted');
  const deliveredAt = firstAt(job, 'delivered');
  const endedAt = firstAt(job, 'cancelled') ?? firstAt(job, 'failed');
  const delivery = [...job.stops].reverse().find((s) => s.kind === 'delivery');
  return {
    jobId: job.id,
    reference: job.reference,
    status: job.status,
    pickup: job.stops.find((s) => s.kind === 'pickup')?.name,
    delivery: delivery?.name,
    driverId: job.driverId,
    vehicleId: job.vehicleId,
    createdAt: job.timeline[0]?.at,
    plannedStart: job.plannedStart,
    dueBy: job.dueBy,
    acceptedAt,
    setOffAt: firstAt(job, 'en_route'),
    deliveredAt,
    endedAt,
    minutesAcceptedToDelivered:
      acceptedAt !== undefined && deliveredAt !== undefined
        ? Math.max(0, (deliveredAt.getTime() - acceptedAt.getTime()) / 60_000)
        : undefined,
    onTime:
      deliveredAt !== undefined && job.dueBy !== undefined
        ? deliveredAt.getTime() <= job.dueBy.getTime()
        : undefined,
    requiresProofOfDelivery: job.requiresProofOfDelivery,
    hasProofOfDelivery: job.hasProofOfDelivery,
  };
}

export interface JobReportSummary {
  readonly total: number;
  readonly delivered: number;
  readonly cancelled: number;
  readonly failed: number;
  /** Anything not yet delivered, cancelled or failed. */
  readonly inProgress: number;
  /** Delivered jobs with a due time, split by whether they made it. */
  readonly deliveredOnTime: number;
  readonly deliveredLate: number;
  /** Mean accepted-to-delivered minutes over delivered jobs; absent when there are none. */
  readonly averageMinutes?: number | undefined;
  /** Jobs that needed a proof-of-delivery photo, and how many of those have one. */
  readonly proofRequired: number;
  readonly proofReceived: number;
}

export function summariseJobReport(rows: readonly JobReportRow[]): JobReportSummary {
  const delivered = rows.filter((r) => r.status === 'delivered');
  const durations = delivered
    .map((r) => r.minutesAcceptedToDelivered)
    .filter((m): m is number => m !== undefined);
  const needingProof = rows.filter((r) => r.requiresProofOfDelivery && r.status === 'delivered');
  return {
    total: rows.length,
    delivered: delivered.length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    inProgress: rows.filter((r) => !['delivered', 'cancelled', 'failed'].includes(r.status)).length,
    deliveredOnTime: delivered.filter((r) => r.onTime === true).length,
    deliveredLate: delivered.filter((r) => r.onTime === false).length,
    averageMinutes:
      durations.length === 0
        ? undefined
        : durations.reduce((sum, m) => sum + m, 0) / durations.length,
    proofRequired: needingProof.length,
    proofReceived: needingProof.filter((r) => r.hasProofOfDelivery).length,
  };
}
