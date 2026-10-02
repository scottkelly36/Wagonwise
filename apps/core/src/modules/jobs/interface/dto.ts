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
    ...(job.driverId === undefined ? {} : { driverId: job.driverId }),
    ...(job.vehicleId === undefined ? {} : { vehicleId: job.vehicleId }),
    ...(job.routePlanId === undefined ? {} : { routePlanId: job.routePlanId }),
    ...(job.plannedStart === undefined ? {} : { plannedStart: job.plannedStart.toISOString() }),
    ...(job.dueBy === undefined ? {} : { dueBy: job.dueBy.toISOString() }),
  };
}
