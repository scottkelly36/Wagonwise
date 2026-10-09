import {
  assignJobRequestSchema,
  createJobRequestSchema,
  jobReportRequestSchema,
  jobReportResponseSchema,
  jobSchema,
  jobNoticeSchema,
  jobRoutePreviewSchema,
  listJobNoticesResponseSchema,
  listJobEtasResponseSchema,
  listJobPositionsResponseSchema,
  listJobsResponseSchema,
  previewJobRouteRequestSchema,
  setJobCommercialRequestSchema,
  proofOfDeliveryResponseSchema,
  type AssignJobRequest,
  type CreateJobRequest,
  type JobReportRequest,
  type JobReportResponse,
  type JobEtaDto,
  type JobNoticeDto,
  type JobRoutePreviewDto,
  type SetJobCommercialRequest,
  type JobDto,
  type JobPositionDto,
  type ProofOfDeliveryResponse,
} from '@wagonwise/contracts/jobs';

import { requestJson, throwUnlessSuccess } from './http';

export async function listJobs(accessToken: string, companyId: string): Promise<JobDto[]> {
  const { status, json } = await requestJson('GET', `/staff/jobs/companies/${companyId}/jobs`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listJobsResponseSchema.parse(json).jobs;
}

/** The jobs report for a period (P2-M8); needs the `view_reports` privilege. */
export async function jobReport(
  accessToken: string,
  companyId: string,
  input: JobReportRequest,
): Promise<JobReportResponse> {
  const body = jobReportRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/staff/jobs/companies/${companyId}/report`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return jobReportResponseSchema.parse(json);
}

export async function createJob(
  accessToken: string,
  companyId: string,
  input: CreateJobRequest,
): Promise<JobDto> {
  const body = createJobRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/staff/jobs/companies/${companyId}/jobs`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return jobSchema.parse(json);
}

export async function assignJob(
  accessToken: string,
  id: string,
  input: AssignJobRequest,
): Promise<JobDto> {
  const body = assignJobRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/staff/jobs/${id}/assign`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return jobSchema.parse(json);
}

export async function cancelJob(accessToken: string, id: string): Promise<JobDto> {
  const { status, json } = await requestJson('POST', `/staff/jobs/${id}/cancel`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return jobSchema.parse(json);
}

/** The delivery photo a driver attached to a job (404 `ProofOfDeliveryNotFound` if none). */
export async function getProofOfDelivery(
  accessToken: string,
  id: string,
  stop?: number,
): Promise<ProofOfDeliveryResponse> {
  const query = stop === undefined ? '' : `?stop=${stop}`;
  const { status, json } = await requestJson('GET', `/staff/jobs/${id}/proof-of-delivery${query}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return proofOfDeliveryResponseSchema.parse(json);
}

/** The latest position of each of the company's jobs that is on the road (P2-M6.1). */
export async function listJobPositions(
  accessToken: string,
  companyId: string,
): Promise<JobPositionDto[]> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/jobs/companies/${companyId}/positions`,
    { authorization: `Bearer ${accessToken}` },
  );
  throwUnlessSuccess(status, json, [200]);
  return listJobPositionsResponseSchema.parse(json).positions;
}

/** ETA, distance and route line for each job on the road that has a vehicle, a position and a
 *  route (P2-M6.4). A job missing from the list simply has none. */
export async function listJobEtas(accessToken: string, companyId: string): Promise<JobEtaDto[]> {
  const { status, json } = await requestJson('GET', `/staff/jobs/companies/${companyId}/etas`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listJobEtasResponseSchema.parse(json).etas;
}

/** How far and how long a job is for a chosen vehicle, before assigning it (P2-M6.4b). Rejects with
 *  `NoRouteForVehicle` when that vehicle cannot get between the stops. */
export async function previewJobRoute(
  accessToken: string,
  id: string,
  vehicleId: string,
): Promise<JobRoutePreviewDto> {
  const body = previewJobRouteRequestSchema.parse({ vehicleId });
  const { status, json } = await requestJson('POST', `/staff/jobs/${id}/route-preview`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return jobRoutePreviewSchema.parse(json);
}

/** How telling each waiting driver went (a push notification), for jobs assigned and not yet accepted. */
export async function listJobNotices(
  accessToken: string,
  companyId: string,
): Promise<JobNoticeDto[]> {
  const { status, json } = await requestJson('GET', `/staff/jobs/companies/${companyId}/notices`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listJobNoticesResponseSchema.parse(json).notices;
}

/** Sends the driver the notification again. */
export async function resendJobNotice(accessToken: string, id: string): Promise<JobNoticeDto> {
  const { status, json } = await requestJson('POST', `/staff/jobs/${id}/resend-notice`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return jobNoticeSchema.parse(json);
}

/** Sets (or clears, with null) who a job is for and what it earns. Needs `dispatch`. */
export async function setJobCommercial(
  accessToken: string,
  id: string,
  input: SetJobCommercialRequest,
): Promise<JobDto> {
  const body = setJobCommercialRequestSchema.parse(input);
  const { status, json } = await requestJson('PUT', `/staff/jobs/${id}/commercial`, {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return jobSchema.parse(json);
}
