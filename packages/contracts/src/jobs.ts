import { z } from 'zod';
import { brandedId } from './brand.js';
import { companyIdSchema } from './companies.js';
import { geoPointSchema, vehicleProfileIdSchema } from './routing.js';

export const jobIdSchema = brandedId<'JobId'>();
export type JobId = z.infer<typeof jobIdSchema>;

export const jobStopSchema = z.object({
  kind: z.enum(['pickup', 'delivery']),
  name: z.string().min(1),
  location: geoPointSchema,
  windowFrom: z.iso.datetime().optional(),
  windowTo: z.iso.datetime().optional(),
  notes: z.string().optional(),
});
export type JobStopDto = z.infer<typeof jobStopSchema>;

export const jobStatusSchema = z.enum([
  'draft',
  'assigned',
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
  'delivered',
  'cancelled',
  'failed',
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobTimelineEntrySchema = z.object({
  status: jobStatusSchema,
  at: z.iso.datetime(),
  position: geoPointSchema.optional(),
  /** The stop the driver was heading for or at when the status changed (0-based). */
  stopIndex: z.number().int().min(0).optional(),
});

export const jobSchema = z.object({
  id: jobIdSchema,
  companyId: companyIdSchema,
  reference: z.string(),
  stops: z.array(jobStopSchema),
  status: jobStatusSchema,
  timeline: z.array(jobTimelineEntrySchema),
  // P2-M5.5: the dispatcher's own call at creation, and whether one's actually been attached.
  requiresProofOfDelivery: z.boolean(),
  hasProofOfDelivery: z.boolean(),
  /** The stop the driver is heading for or at (0-based into stops); stops.length once delivered. Defaults to 0 for
   *  a server that predates multi-stop jobs. */
  currentStop: z.number().int().min(0).default(0),
  /** The delivery stops (by position) that have a proof photo. */
  proofStops: z.array(z.number().int().min(0)).default([]),
  /** Who the job is for, and what it earns in whole pence. Only for staff who can dispatch or read reports; never sent
   *  to a driver. */
  customer: z.string().optional(),
  pricePence: z.number().int().min(0).optional(),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  routePlanId: z.string().optional(),
  plannedStart: z.iso.datetime().optional(),
  dueBy: z.iso.datetime().optional(),
});
export type JobDto = z.infer<typeof jobSchema>;

/** No `id` field (unlike companies' own create request) — a job isn't created from an offline
 *  queue, so there's no idempotency reason to let the client pick the id; core's own
 *  `IdGenerator` does, same as fleet's `createFleetVehicleRequestSchema`. A delivery is needed, and
 *  a pickup is optional (domain's own `validateStops`); the server re-validates regardless.  */
export const createJobRequestSchema = z.object({
  companyId: companyIdSchema,
  reference: z.string().min(1),
  stops: z.array(jobStopSchema).min(1).max(20),
  plannedStart: z.iso.datetime().optional(),
  dueBy: z.iso.datetime().optional(),
  requiresProofOfDelivery: z.boolean().optional(),
  customer: z.string().max(120).optional(),
  /** In whole pence. */
  pricePence: z.number().int().min(0).max(100_000_000).optional(),
});
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

export const jobCompanyIdParamsSchema = z.object({
  companyId: z.uuid(),
});
export type JobCompanyIdParams = z.infer<typeof jobCompanyIdParamsSchema>;

/** The shape of a domain error body every jobs route can send (interface/error-mapping.ts's
 *  `statusFor()` picks the status) — mirrors every other module's own error response schema. */
export const jobsErrorResponseSchema = z.object({
  tag: z.string(),
  requestId: z.string(),
});
export type JobsErrorResponse = z.infer<typeof jobsErrorResponseSchema>;

export const listJobsResponseSchema = z.object({
  jobs: z.array(jobSchema),
});
export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;

/** `POST /staff/jobs/companies/:companyId/report` (P2-M8): the jobs with any activity between `from`
 *  (inclusive) and `to` (exclusive), for the reports page and its CSV download. A POST, like the other
 *  staff lists with a body, so the staff BFF forwards it the same way. */
export const jobReportRequestSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export type JobReportRequest = z.infer<typeof jobReportRequestSchema>;

export const jobReportRowSchema = z.object({
  jobId: z.string(),
  reference: z.string(),
  status: jobStatusSchema,
  pickup: z.string().optional(),
  delivery: z.string().optional(),
  /** The driver's sign-in (email or phone) and the vehicle's name, looked up by the server so a
   *  report reader needs no access to the fleet pages. Absent when unassigned or unknown. */
  driver: z.string().optional(),
  vehicle: z.string().optional(),
  createdAt: z.iso.datetime().optional(),
  plannedStart: z.iso.datetime().optional(),
  dueBy: z.iso.datetime().optional(),
  acceptedAt: z.iso.datetime().optional(),
  setOffAt: z.iso.datetime().optional(),
  deliveredAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  minutesAcceptedToDelivered: z.number().optional(),
  onTime: z.boolean().optional(),
  requiresProofOfDelivery: z.boolean(),
  hasProofOfDelivery: z.boolean(),
  customer: z.string().optional(),
  pricePence: z.number().int().min(0).optional(),
});
export type JobReportRowDto = z.infer<typeof jobReportRowSchema>;

export const jobReportSummarySchema = z.object({
  total: z.number(),
  delivered: z.number(),
  cancelled: z.number(),
  failed: z.number(),
  inProgress: z.number(),
  deliveredOnTime: z.number(),
  deliveredLate: z.number(),
  averageMinutes: z.number().optional(),
  proofRequired: z.number(),
  proofReceived: z.number(),
  /** The price of the jobs delivered in the period, in pence, and how many of them have no price. */
  revenuePence: z.number().int().default(0),
  deliveredWithoutPrice: z.number().int().default(0),
});
export type JobReportSummaryDto = z.infer<typeof jobReportSummarySchema>;

export const jobReportResponseSchema = z.object({
  rows: z.array(jobReportRowSchema),
  summary: jobReportSummarySchema,
});
export type JobReportResponse = z.infer<typeof jobReportResponseSchema>;

/** `GET /jobs/current` (P2-M5.1): the one job a driver is on right now, or `null`. */
export const currentJobResponseSchema = z.object({
  job: jobSchema.nullable(),
});
export type CurrentJobResponse = z.infer<typeof currentJobResponseSchema>;

/** `POST /jobs/:id/navigation-profile`: the routing profile to navigate a job with. It carries the
 *  measurements of the company vehicle the job is assigned to, never a profile the driver picked.
 *  Plan the route with `profileId`. */
export const navigationProfileResponseSchema = z.object({
  profileId: vehicleProfileIdSchema,
  vehicleName: z.string(),
});
export type NavigationProfileResponse = z.infer<typeof navigationProfileResponseSchema>;

/** The driver and vehicle must both belong to the job's company; core checks. */
export const assignJobRequestSchema = z.object({
  driverId: z.string().min(1),
  vehicleId: z.string().min(1),
});
export type AssignJobRequest = z.infer<typeof assignJobRequestSchema>;

/** One step forward; `position` is the GPS fix to stamp on the change, when there is one. */
export const advanceJobStatusRequestSchema = z.object({
  status: jobStatusSchema,
  position: geoPointSchema.optional(),
});
export type AdvanceJobStatusRequest = z.infer<typeof advanceJobStatusRequestSchema>;

export const failJobRequestSchema = z.object({
  position: geoPointSchema.optional(),
});
export type FailJobRequest = z.infer<typeof failJobRequestSchema>;

/** `GET /staff/jobs/:id/proof-of-delivery?stop=`: which delivery stop's photo (its position); the latest when absent. */
export const proofOfDeliveryQuerySchema = z.object({
  stop: z.coerce.number().int().min(0).optional(),
});

export const jobIdParamsSchema = z.object({
  id: z.uuid(),
});
export type JobIdParams = z.infer<typeof jobIdParamsSchema>;

/** An image type and nothing else: the dashboard shows the photo from a `data:` URL built with
 *  this, so it must not be able to carry `text/html` or the like. Enforced on upload and again on
 *  the way back out. */
const imageContentTypeSchema = z.string().regex(/^image\/[a-z0-9.+-]+$/i);

/** `POST /jobs/:id/proof-of-delivery` (P2-M5.5): base64 over JSON, same wire style as everything
 *  else in this app — no multipart handling needed in the BFF or core. The max length is a rough
 *  5MB-after-compression cap on the decoded photo (base64 runs ~1.37x the binary size). */
export const attachProofOfDeliveryRequestSchema = z.object({
  contentType: imageContentTypeSchema,
  dataBase64: z.base64().min(1).max(7_000_000),
});
export type AttachProofOfDeliveryRequest = z.infer<typeof attachProofOfDeliveryRequestSchema>;

/** `GET /staff/jobs/:id/proof-of-delivery`: the photo a dispatcher looks at, base64 over JSON like
 *  the upload. */
export const proofOfDeliveryResponseSchema = z.object({
  contentType: imageContentTypeSchema,
  dataBase64: z.base64().min(1).max(7_000_000),
  capturedAt: z.iso.datetime(),
});
export type ProofOfDeliveryResponse = z.infer<typeof proofOfDeliveryResponseSchema>;

/** `POST /jobs/:id/position` (P2-M6.1): where the driver is right now. The server stamps the time. */
export const reportJobPositionRequestSchema = z.object({
  // Range-checked, unlike the general point: this one is written straight into a PostGIS column.
  location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
});
export type ReportJobPositionRequest = z.infer<typeof reportJobPositionRequestSchema>;

export const jobPositionSchema = z.object({
  jobId: jobIdSchema,
  location: geoPointSchema,
  recordedAt: z.iso.datetime(),
});
export type JobPositionDto = z.infer<typeof jobPositionSchema>;

/** `GET /staff/jobs/companies/:companyId/positions`: the latest position of each job being driven. */
export const listJobPositionsResponseSchema = z.object({
  positions: z.array(jobPositionSchema),
});
export type ListJobPositionsResponse = z.infer<typeof listJobPositionsResponseSchema>;

/** One job's ETA for the live map (P2-M6.4): from the vehicle's last heard position to the stop it
 *  is heading for, for that vehicle's own dimensions. `geometry` is an encoded polyline6 line.
 *  Hazard-agnostic, so a guide to travel time rather than a plan the driver follows. */
export const jobEtaSchema = z.object({
  jobId: jobIdSchema,
  stopKind: z.enum(['pickup', 'delivery']),
  distanceKm: z.number(),
  durationMin: z.number(),
  geometry: z.string(),
  fromRecordedAt: z.iso.datetime(),
});
export type JobEtaDto = z.infer<typeof jobEtaSchema>;

/** `GET /staff/jobs/companies/:companyId/etas`. */
export const listJobEtasResponseSchema = z.object({
  etas: z.array(jobEtaSchema),
});
export type ListJobEtasResponse = z.infer<typeof listJobEtasResponseSchema>;

/** `POST /staff/jobs/:id/route-preview` (P2-M6.4b): how far and how long the job is for a chosen
 *  vehicle, before assigning it. */
export const previewJobRouteRequestSchema = z.object({
  vehicleId: z.string().min(1),
});
export type PreviewJobRouteRequest = z.infer<typeof previewJobRouteRequestSchema>;

export const jobRouteLegSchema = z.object({
  fromName: z.string(),
  toName: z.string(),
  distanceKm: z.number(),
  durationMin: z.number(),
});

export const jobRoutePreviewSchema = z.object({
  legs: z.array(jobRouteLegSchema),
  distanceKm: z.number(),
  durationMin: z.number(),
});
export type JobRoutePreviewDto = z.infer<typeof jobRoutePreviewSchema>;

/**
 * How telling the driver about their job went. `sent`: the push went to at least one of their phones (that is all it
 * says: it cannot tell whether they read it); `no_device`: the driver has no phone registered for notifications;
 * `failed`: the push service refused it or could not be reached. `seenAt` is when the driver first opened the job in
 * the app, which is the better sign that they have it.
 */
export const jobNoticeSchema = z.object({
  jobId: jobIdSchema,
  driverId: z.string(),
  result: z.enum(['sent', 'no_device', 'failed']).nullable(),
  devices: z.number().int().min(0),
  attempts: z.number().int().min(0),
  lastAttemptAt: z.iso.datetime().nullable(),
  seenAt: z.iso.datetime().nullable(),
});
export type JobNoticeDto = z.infer<typeof jobNoticeSchema>;

/** `GET /staff/jobs/companies/:companyId/notices`: the notice for each job assigned and not yet accepted. */
export const listJobNoticesResponseSchema = z.object({ notices: z.array(jobNoticeSchema) });

/** `PUT /staff/jobs/:id/commercial`: who the job is for and what it earns. `null` clears a field; a field left out is left
 *  as it is. Needs `dispatch`. */
export const setJobCommercialRequestSchema = z.object({
  customer: z.string().max(120).nullable().optional(),
  pricePence: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
export type SetJobCommercialRequest = z.infer<typeof setJobCommercialRequestSchema>;
