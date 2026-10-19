import {
  listFeedbackResponseSchema,
  type FEEDBACK_STATUSES,
  type ListFeedbackResponse,
} from '@wagonwise/contracts/feedback';

import { requestJson, throwUnlessSuccess } from './http';

export async function listFeedback(
  accessToken: string,
  status: (typeof FEEDBACK_STATUSES)[number],
): Promise<ListFeedbackResponse> {
  const { status: code, json } = await requestJson('GET', `/staff/feedback?status=${status}`, {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(code, json, [200]);
  return listFeedbackResponseSchema.parse(json);
}

export async function setFeedbackResolved(
  accessToken: string,
  id: string,
  resolved: boolean,
): Promise<void> {
  const { status, json } = await requestJson('PUT', `/staff/feedback/${id}/resolved`, {
    authorization: `Bearer ${accessToken}`,
    body: { resolved },
  });
  throwUnlessSuccess(status, json, [204]);
}
