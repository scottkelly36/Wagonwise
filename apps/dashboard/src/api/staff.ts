import {
  acceptStaffInviteResponseSchema,
  confirmStaffEnrolmentResponseSchema,
  createStaffInviteResponseSchema,
  listStaffAuditResponseSchema,
  listStaffResponseSchema,
  staffAccountSchema,
  staffRefreshTokenResponseSchema,
  staffSignInResponseSchema,
  staffTokensResponseSchema,
  type AcceptStaffInviteRequest,
  type AcceptStaffInviteResponse,
  type ConfirmStaffEnrolmentResponse,
  type CreateStaffInviteRequest,
  type CreateStaffInviteResponse,
  type Privilege,
  type StaffAuditEntryDto,
  type StaffAccountDto,
  type StaffRefreshTokenResponse,
  type StaffSignInResponse,
  type StaffTokensResponse,
} from '@wagonwise/contracts/staff';
import { staffBffUrl } from './config';
import { requestJson, throwUnlessSuccess, type HttpMethod } from './http';

/** Every staff call goes to the staff BFF, never the driver one. */
function call(method: HttpMethod, path: string, body?: unknown, accessToken?: string) {
  return requestJson(method, path, {
    baseUrl: staffBffUrl,
    ...(body === undefined ? {} : { body }),
    ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
  });
}

// ---- Before there's a token --------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<StaffSignInResponse> {
  const { status, json } = await call('POST', '/staff/auth/sign-in', { email, password });
  throwUnlessSuccess(status, json, [200]);
  return staffSignInResponseSchema.parse(json);
}

export async function verifySecondFactor(
  challengeId: string,
  code: string,
): Promise<StaffTokensResponse> {
  const { status, json } = await call('POST', '/staff/auth/second-factor', { challengeId, code });
  throwUnlessSuccess(status, json, [200]);
  return staffTokensResponseSchema.parse(json);
}

export async function refresh(refreshToken: string): Promise<StaffRefreshTokenResponse> {
  const { status, json } = await call('POST', '/staff/auth/refresh', { refreshToken });
  throwUnlessSuccess(status, json, [200]);
  return staffRefreshTokenResponseSchema.parse(json);
}

export async function signOut(refreshToken: string): Promise<void> {
  const { status, json } = await call('POST', '/staff/auth/sign-out', { refreshToken });
  throwUnlessSuccess(status, json, [204]);
}

export async function acceptInvite(
  request: AcceptStaffInviteRequest,
): Promise<AcceptStaffInviteResponse> {
  const { status, json } = await call('POST', '/staff/invites/accept', request);
  throwUnlessSuccess(status, json, [200]);
  return acceptStaffInviteResponseSchema.parse(json);
}

export async function confirmEnrolment(
  enrolmentId: string,
  code: string,
): Promise<ConfirmStaffEnrolmentResponse> {
  const { status, json } = await call('POST', '/staff/invites/confirm', { enrolmentId, code });
  throwUnlessSuccess(status, json, [200]);
  return confirmStaffEnrolmentResponseSchema.parse(json);
}

// ---- Signed in -------------------------------------------------------------------------

export async function me(accessToken: string): Promise<StaffAccountDto> {
  const { status, json } = await call('GET', '/staff/me', undefined, accessToken);
  throwUnlessSuccess(status, json, [200]);
  return staffAccountSchema.parse(json);
}

export async function createInvite(
  accessToken: string,
  request: CreateStaffInviteRequest,
): Promise<CreateStaffInviteResponse> {
  const { status, json } = await call('POST', '/staff/invites', request, accessToken);
  throwUnlessSuccess(status, json, [201]);
  return createStaffInviteResponseSchema.parse(json);
}

/** No `companyId`: everyone, which only WagonWise admins may ask for. */
export async function listMembers(
  accessToken: string,
  companyId?: string,
): Promise<StaffAccountDto[]> {
  const path =
    companyId === undefined
      ? '/staff/members'
      : `/staff/members?companyId=${encodeURIComponent(companyId)}`;
  const { status, json } = await call('GET', path, undefined, accessToken);
  throwUnlessSuccess(status, json, [200]);
  return listStaffResponseSchema.parse(json).staff;
}

export async function setPrivileges(
  accessToken: string,
  staffId: string,
  privileges: readonly Privilege[],
): Promise<StaffAccountDto> {
  const { status, json } = await call(
    'PUT',
    `/staff/members/${staffId}/privileges`,
    { privileges },
    accessToken,
  );
  throwUnlessSuccess(status, json, [200]);
  return staffAccountSchema.parse(json);
}

export async function removeMember(accessToken: string, staffId: string): Promise<void> {
  const { status, json } = await call(
    'DELETE',
    `/staff/members/${staffId}`,
    undefined,
    accessToken,
  );
  throwUnlessSuccess(status, json, [204]);
}

/** Newest first, the latest 200. No `companyId`: everything (WagonWise admins only). */
export async function listAudit(
  accessToken: string,
  companyId?: string,
): Promise<StaffAuditEntryDto[]> {
  const path =
    companyId === undefined
      ? '/staff/audit'
      : `/staff/audit?companyId=${encodeURIComponent(companyId)}`;
  const { status, json } = await call('GET', path, undefined, accessToken);
  throwUnlessSuccess(status, json, [200]);
  return listStaffAuditResponseSchema.parse(json).entries;
}
