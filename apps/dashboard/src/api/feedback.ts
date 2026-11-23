import {
  listFeedbackResponseSchema,
  researchContactSchema,
  researchContactsResponseSchema,
  setResearchContactRequestSchema,
  type FEEDBACK_STATUSES,
  type ListFeedbackResponse,
  type ResearchContactDto,
  type ResearchContactsResponse,
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

/** A company's staff member: their own answer about being asked for feedback, and the wording to show. */
export async function getResearchContact(accessToken: string): Promise<ResearchContactDto> {
  const { status, json } = await requestJson('GET', '/staff/research-contact', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return researchContactSchema.parse(json);
}

/** Says yes or no to being asked for feedback. `version` is the wording that was shown, so what is stored is what they saw. */
export async function setResearchContact(
  accessToken: string,
  agreed: boolean,
  version: number,
): Promise<ResearchContactDto> {
  const body = setResearchContactRequestSchema.parse({ agreed, version });
  const { status, json } = await requestJson('PUT', '/staff/research-contact', {
    authorization: `Bearer ${accessToken}`,
    body,
  });
  throwUnlessSuccess(status, json, [200]);
  return researchContactSchema.parse(json);
}

/** WagonWise staff: the people whose latest answer is yes. */
export async function listResearchContacts(accessToken: string): Promise<ResearchContactsResponse> {
  const { status, json } = await requestJson('GET', '/staff/research-contacts', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return researchContactsResponseSchema.parse(json);
}
