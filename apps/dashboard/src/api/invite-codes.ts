import {
  inviteCodeSchema,
  listInviteCodesResponseSchema,
  type InviteCodeDto,
} from '@wagonwise/contracts/identity';

import { requestJson, throwUnlessSuccess } from './http';

export async function createInviteCode(accessToken: string): Promise<InviteCodeDto> {
  const { status, json } = await requestJson('POST', '/identity/invite-codes', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [201]);
  return inviteCodeSchema.parse(json);
}

export async function listInviteCodes(accessToken: string): Promise<InviteCodeDto[]> {
  const { status, json } = await requestJson('GET', '/identity/invite-codes', {
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return listInviteCodesResponseSchema.parse(json).inviteCodes;
}
