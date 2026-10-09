import type { JobReport } from '../application/report-jobs.js';
import { canDispatch, canViewReports } from '../application/authorization.js';
import type { Caller } from '../application/ports/caller-directory.js';
import type { JobNotice } from '../application/ports/notices.js';
import type { Job, JobStop } from '../domain/job.js';

function stopDto(stop: JobStop) {
  return {
    kind: stop.kind,
    name: stop.name,
    location: stop.location,
    ...(stop.windowFrom === undefined ? {} : { windowFrom: stop.windowFrom.toISOString() }),
    ...(stop.windowTo === undefined ? {} : { windowTo: stop.windowTo.toISOString() }),
    ...(stop.notes === undefined ? {} : { notes: stop.notes }),
  };
}

/** Shared by the staff and driver route files, so a job looks the same to both (P2-M5.1). */
export function jobDto(job: Job) {
  return {
    id: job.id,
    companyId: job.companyId,
    reference: job.reference,
    stops: job.stops.map(stopDto),
    status: job.status,
    timeline: job.timeline.map((entry) => ({
      status: entry.status,
      at: entry.at.toISOString(),
      ...(entry.position === undefined ? {} : { position: entry.position }),
      ...(entry.stopIndex === undefined ? {} : { stopIndex: entry.stopIndex }),
    })),
    currentStop: job.currentStop,
    proofStops: [...job.proofStops],
    requiresProofOfDelivery: job.requiresProofOfDelivery,
    hasProofOfDelivery: job.hasProofOfDelivery,
    ...(job.driverId === undefined ? {} : { driverId: job.driverId }),
    ...(job.vehicleId === undefined ? {} : { vehicleId: job.vehicleId }),
    ...(job.routePlanId === undefined ? {} : { routePlanId: job.routePlanId }),
    ...(job.plannedStart === undefined ? {} : { plannedStart: job.plannedStart.toISOString() }),
    ...(job.dueBy === undefined ? {} : { dueBy: job.dueBy.toISOString() }),
  };
}

/**
 * A job as the office sees it: the driver's view plus who it is for and what it earns, but only for staff who can dispatch
 * or read reports. A driver never gets those (`jobDto` above is theirs), and a viewer without either privilege gets the job
 * without the money.
 */
export function staffJobDto(job: Job, caller: Caller) {
  const showMoney = canDispatch(caller, job.companyId) || canViewReports(caller, job.companyId);
  return {
    ...jobDto(job),
    ...(showMoney && job.customer !== undefined ? { customer: job.customer } : {}),
    ...(showMoney && job.pricePence !== undefined ? { pricePence: job.pricePence } : {}),
  };
}

const iso = (date: Date | undefined) => (date === undefined ? {} : { value: date.toISOString() });

/** The jobs report as it goes over the wire (P2-M8): dates as ISO text, absent fields left out. */
export function jobReportDto(report: JobReport) {
  const optional = <K extends string>(key: K, date: Date | undefined) =>
    date === undefined ? {} : ({ [key]: iso(date).value } as Record<K, string>);
  return {
    rows: report.rows.map((row) => ({
      jobId: row.jobId,
      reference: row.reference,
      status: row.status,
      ...(row.pickup === undefined ? {} : { pickup: row.pickup }),
      ...(row.delivery === undefined ? {} : { delivery: row.delivery }),
      ...(row.driver === undefined ? {} : { driver: row.driver }),
      ...(row.vehicle === undefined ? {} : { vehicle: row.vehicle }),
      ...optional('createdAt', row.createdAt),
      ...optional('plannedStart', row.plannedStart),
      ...optional('dueBy', row.dueBy),
      ...optional('acceptedAt', row.acceptedAt),
      ...optional('setOffAt', row.setOffAt),
      ...optional('deliveredAt', row.deliveredAt),
      ...optional('endedAt', row.endedAt),
      ...(row.minutesAcceptedToDelivered === undefined
        ? {}
        : { minutesAcceptedToDelivered: row.minutesAcceptedToDelivered }),
      ...(row.onTime === undefined ? {} : { onTime: row.onTime }),
      requiresProofOfDelivery: row.requiresProofOfDelivery,
      hasProofOfDelivery: row.hasProofOfDelivery,
      ...(row.customer === undefined ? {} : { customer: row.customer }),
      ...(row.pricePence === undefined ? {} : { pricePence: row.pricePence }),
    })),
    summary: {
      ...report.summary,
      ...(report.summary.averageMinutes === undefined
        ? {}
        : { averageMinutes: report.summary.averageMinutes }),
    },
  };
}

/** How telling a driver about a job went, as it goes over the wire. */
export function noticeDto(notice: JobNotice) {
  return {
    jobId: notice.jobId,
    driverId: notice.driverId,
    result: notice.result,
    devices: notice.devices,
    attempts: notice.attempts,
    lastAttemptAt: notice.lastAttemptAt === null ? null : notice.lastAttemptAt.toISOString(),
    seenAt: notice.seenAt === null ? null : notice.seenAt.toISOString(),
  };
}
