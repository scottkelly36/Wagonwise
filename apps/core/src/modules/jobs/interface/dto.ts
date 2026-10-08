import type { JobReport } from '../application/report-jobs.js';
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
    })),
    requiresProofOfDelivery: job.requiresProofOfDelivery,
    hasProofOfDelivery: job.hasProofOfDelivery,
    ...(job.driverId === undefined ? {} : { driverId: job.driverId }),
    ...(job.vehicleId === undefined ? {} : { vehicleId: job.vehicleId }),
    ...(job.routePlanId === undefined ? {} : { routePlanId: job.routePlanId }),
    ...(job.plannedStart === undefined ? {} : { plannedStart: job.plannedStart.toISOString() }),
    ...(job.dueBy === undefined ? {} : { dueBy: job.dueBy.toISOString() }),
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
    })),
    summary: {
      ...report.summary,
      ...(report.summary.averageMinutes === undefined
        ? {}
        : { averageMinutes: report.summary.averageMinutes }),
    },
  };
}
