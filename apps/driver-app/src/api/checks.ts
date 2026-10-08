import {
  attachCheckPhotoRequestSchema,
  checksDueResponseSchema,
  submitCheckRequestSchema,
  submittedCheckSchema,
  type AttachCheckPhotoRequest,
  type ChecksDueResponse,
  type SubmitCheckRequest,
  type SubmittedCheckDto,
} from '@wagonwise/contracts/checks';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

/** The check lists for the vehicle on the driver's current job, and which are done today. */
export async function getChecksDue(accessToken: string): Promise<ChecksDueResponse> {
  const { status, json } = await requestJson('GET', '/checks/mine', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return checksDueResponseSchema.parse(json);
}

/** Files a completed check (`POST /checks`). The id is the app's own, so sending the same check twice, which the
 *  offline queue may do when a response never arrived, returns the check already made. */
export async function submitCheck(
  accessToken: string,
  input: SubmitCheckRequest,
): Promise<SubmittedCheckDto> {
  const body = submitCheckRequestSchema.parse(input);
  const { status, json } = await requestJson('POST', '/checks', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [201]);
  return submittedCheckSchema.parse(json);
}

/** A photo for one question of a check already filed (`PUT /checks/:id/photos/:itemId`, 204). A retake, or a
 *  retry, replaces the earlier one. */
export async function attachCheckPhoto(
  accessToken: string,
  checkId: string,
  itemId: string,
  input: AttachCheckPhotoRequest,
): Promise<void> {
  const body = attachCheckPhotoRequestSchema.parse(input);
  const { status, json } = await requestJson(
    'PUT',
    `/checks/${checkId}/photos/${encodeURIComponent(itemId)}`,
    { body, authorization: bearer(accessToken) },
  );
  throwUnlessSuccess(status, json, [204]);
}
