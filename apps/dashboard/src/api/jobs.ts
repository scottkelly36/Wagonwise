import {
  assignJobRequestSchema,
  createJobRequestSchema,
  jobSchema,
  listJobsResponseSchema,
  type AssignJobRequest,
  type CreateJobRequest,
  type JobDto,
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
