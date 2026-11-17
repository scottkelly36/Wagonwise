import {
  flowEventsRequestSchema,
  flowEventsResponseSchema,
  type FlowEventsRequest,
} from '@wagonwise/contracts/usage';

import { requestJson, throwUnlessSuccess } from './http';

/** Sends a batch of anonymous steps and choices; returns how many the server kept. */
export async function postFlowEvents(
  accessToken: string,
  request: FlowEventsRequest,
): Promise<number> {
  const { status, json } = await requestJson('POST', '/usage/flow-events', {
    body: flowEventsRequestSchema.parse(request),
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return flowEventsResponseSchema.parse(json).recorded;
}
