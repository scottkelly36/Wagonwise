import {
  referralCodeLookupResponseSchema,
  staffReferralListResponseSchema,
  staffReferralSchema,
  type CreateReferralRequest,
  type ReferralCodeLookupResponse,
  type SetReferralStatusRequest,
  type StaffReferralDto,
  type StaffReferralListResponse,
} from '@wagonwise/contracts/referrals';

import { requestJson, throwUnlessSuccess } from './http';

const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });

export async function listReferrals(accessToken: string): Promise<StaffReferralListResponse> {
  const { status, json } = await requestJson('GET', '/staff/referrals', bearer(accessToken));
  throwUnlessSuccess(status, json, [200]);
  return staffReferralListResponseSchema.parse(json);
}

export async function lookupCode(
  accessToken: string,
  code: string,
): Promise<ReferralCodeLookupResponse> {
  const { status, json } = await requestJson(
    'GET',
    `/staff/referrals/codes/${encodeURIComponent(code.trim())}`,
    bearer(accessToken),
  );
  throwUnlessSuccess(status, json, [200]);
  return referralCodeLookupResponseSchema.parse(json);
}

export async function createReferral(
  accessToken: string,
  request: CreateReferralRequest,
): Promise<StaffReferralDto> {
  const { status, json } = await requestJson('POST', '/staff/referrals', {
    ...bearer(accessToken),
    body: request,
  });
  throwUnlessSuccess(status, json, [201]);
  return staffReferralSchema.parse(json);
}

export async function setReferralStatus(
  accessToken: string,
  id: string,
  request: SetReferralStatusRequest,
): Promise<StaffReferralDto> {
  const { status, json } = await requestJson('PUT', `/staff/referrals/${id}/status`, {
    ...bearer(accessToken),
    body: request,
  });
  throwUnlessSuccess(status, json, [200]);
  return staffReferralSchema.parse(json);
}
