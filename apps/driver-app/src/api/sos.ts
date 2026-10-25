import {
  raiseSosResponseSchema,
  type RaiseSosRequest,
  type RaiseSosResponse,
} from '@wagonwise/contracts/sos';

import { requestJson, throwUnlessSuccess } from './http';

/**
 * SOS: tells the companies the driver drives for where they are (the three words, who they are, the lorry and the job), and
 * answers with the three words and who was told. For a driver with no company nothing is sent and `notified` is empty: the words
 * are for them to read out. `requestId` is chosen by the app for the press, so a retry does not tell the office twice.
 */
export async function raiseSos(
  accessToken: string,
  input: RaiseSosRequest,
): Promise<RaiseSosResponse> {
  const { status, json } = await requestJson('POST', '/sos/raise', {
    body: input,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return raiseSosResponseSchema.parse(json);
}

/** The driver says it was a mistake or they are all right: the office is told. */
export async function cancelSos(accessToken: string, requestId: string): Promise<void> {
  const { status, json } = await requestJson('POST', '/sos/cancel', {
    body: { requestId },
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [204]);
}
