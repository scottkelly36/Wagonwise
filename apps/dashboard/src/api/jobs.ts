import {
  assignJobRequestSchema,
  createJobRequestSchema,
  jobSchema,
  listJobEtasResponseSchema,
  listJobPositionsResponseSchema,
  listJobsResponseSchema,
  proofOfDeliveryResponseSchema,
  type AssignJobRequest,
  type CreateJobRequest,
  type JobEtaDto,
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
): Promise<ProofOfDeliveryResponse> {
  const { status, json } = await requestJson('GET', `/staff/jobs/${id}/proof-of-delivery`, {
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
