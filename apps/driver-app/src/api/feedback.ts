import {
  feedbackNoteSchema,
  submitFeedbackRequestSchema,
  type FeedbackNoteDto,
  type SubmitFeedbackRequest,
} from '@wagonwise/contracts/feedback';

import { requestJson, throwUnlessSuccess } from './http';

export async function submitFeedback(
  accessToken: string,
  input: SubmitFeedbackRequest,
): Promise<FeedbackNoteDto> {
  const body = submitFeedbackRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/feedback/notes', {
    body,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return feedbackNoteSchema.parse(json);
}
