import {
  advanceJobStatusRequestSchema,
  currentJobResponseSchema,
  jobSchema,
  type AdvanceJobStatusRequest,
  type JobDto,
} from '@wagonwise/contracts/jobs';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

/** The one job a driver is on right now, or `null` (P2-M5.2's job screen). */
export async function getCurrentJob(accessToken: string): Promise<JobDto | null> {
  const { status, json } = await requestJson('GET', '/jobs/current', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return currentJobResponseSchema.parse(json).job;
}

/** One step forward (design doc §5: "Arrived at pickup" → "Loaded" → "Set off" → "Arrived" →
 *  "Delivered") — `lib/job-status.ts`'s `NEXT_STEP` is what drives which `status` this is ever
 *  called with; core re-validates regardless. */
export async function advanceJobStatus(
  accessToken: string,
  jobId: string,
  input: AdvanceJobStatusRequest,
): Promise<JobDto> {
  const body = advanceJobStatusRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/jobs/${jobId}/status`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return jobSchema.parse(json);
}
