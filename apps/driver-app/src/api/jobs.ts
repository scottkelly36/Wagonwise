import {
  advanceJobStatusRequestSchema,
  attachProofOfDeliveryRequestSchema,
  currentJobResponseSchema,
  jobSchema,
  reportJobPositionRequestSchema,
  type AdvanceJobStatusRequest,
  type AttachProofOfDeliveryRequest,
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

/** Uploads the delivery photo (`POST /jobs/:id/proof-of-delivery`, 204). A retake replaces the
 *  earlier photo on the server, so calling this twice for one job is harmless — which is what lets
 *  the offline queue retry an upload whose response never arrived. */
export async function attachProofOfDelivery(
  accessToken: string,
  jobId: string,
  input: AttachProofOfDeliveryRequest,
): Promise<void> {
  const body = attachProofOfDeliveryRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', `/jobs/${jobId}/proof-of-delivery`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}

/** Where the driver is right now (`POST /jobs/:id/position`, 204). Core refuses (409 `NotTracking`)
 *  unless the job is being driven; the caller treats any failure as "skip this one". */
export async function reportJobPosition(
  accessToken: string,
  jobId: string,
  location: { readonly lat: number; readonly lon: number },
): Promise<void> {
  const body = reportJobPositionRequestSchema.parse({ location });
  const { status, json } = await requestJson('POST', `/jobs/${jobId}/position`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [204]);
}
