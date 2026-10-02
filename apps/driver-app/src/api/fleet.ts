import {
  driverLinkSchema,
  joinWithCodeRequestSchema,
  listDriverLinksResponseSchema,
  respondToInvitationRequestSchema,
  type DriverLinkDto,
} from '@wagonwise/contracts/fleet';

import { requestJson, throwUnlessSuccess } from './http';

function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

export async function listMyLinks(accessToken: string): Promise<DriverLinkDto[]> {
  const { status, json } = await requestJson('GET', '/fleet/links', {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return listDriverLinksResponseSchema.parse(json).links;
}

export async function joinWithCode(accessToken: string, code: string): Promise<DriverLinkDto> {
  const body = joinWithCodeRequestSchema.parse({ code });
  const { status, json } = await requestJson('POST', '/fleet/links/join', {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [201]);
  return driverLinkSchema.parse(json);
}

export async function respondToInvitation(
  accessToken: string,
  id: string,
  accept: boolean,
): Promise<DriverLinkDto> {
  const body = respondToInvitationRequestSchema.parse({ accept });
  const { status, json } = await requestJson('POST', `/fleet/links/${id}/respond`, {
    body,
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return driverLinkSchema.parse(json);
}

/** Leaves an active company, or withdraws a request still waiting on staff — same endpoint,
 *  core decides which applies from the link's own status. */
export async function leaveLink(accessToken: string, id: string): Promise<DriverLinkDto> {
  const { status, json } = await requestJson('POST', `/fleet/links/${id}/leave`, {
    authorization: bearer(accessToken),
  });
  throwUnlessSuccess(status, json, [200]);
  return driverLinkSchema.parse(json);
}
