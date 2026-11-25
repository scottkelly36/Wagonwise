import {
  acceptStaffInviteResponseSchema,
  confirmStaffEnrolmentResponseSchema,
  createStaffInviteResponseSchema,
  listStaffAuditResponseSchema,
  listStaffResponseSchema,
  previewStaffInviteResponseSchema,
  staffAccountSchema,
  staffMeSchema,
  staffRefreshTokenResponseSchema,
  staffSignInResponseSchema,
  staffTokensResponseSchema,
  type AcceptStaffInviteRequest,
  type AcceptStaffInviteResponse,
  type ConfirmStaffEnrolmentResponse,
  type CreateStaffInviteRequest,
  type CreateStaffInviteResponse,
  type Privilege,
  type PreviewStaffInviteResponse,
  type StaffAuditEntryDto,
  type StaffAccountDto,
  type StaffMeDto,
  type StaffRefreshTokenResponse,
  type StaffSignInResponse,
  type StaffTokensResponse,
} from '@wagonwise/contracts/staff';
import {
  trialLinkPreviewSchema,
  trialStartResponseSchema,
  type TrialLinkPreview,
  type TrialStartResponse,
} from '@wagonwise/contracts/signups';
import { requestJson, throwUnlessSuccess, type HttpMethod } from './http';

function call(method: HttpMethod, path: string, body?: unknown, accessToken?: string) {
  return requestJson(method, path, {
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

/** "Forgot your password": always succeeds from the caller's side, whether or not the address has an account. */
export async function forgotPassword(email: string): Promise<void> {
  const { status, json } = await call('POST', '/staff/auth/forgot-password', { email });
  throwUnlessSuccess(status, json, [204]);
}

/** What an emailed trial link is for, before the firm presses the button. No sign-in: the link is the proof. */
export async function previewTrialLink(token: string): Promise<TrialLinkPreview> {
  const { status, json } = await call('POST', '/staff/trial/preview', { token });
  throwUnlessSuccess(status, json, [200]);
  return trialLinkPreviewSchema.parse(json);
}

/** The firm presses Start my trial. `company` is only needed when its registration had no name. */
export async function startTrial(token: string, company?: string): Promise<TrialStartResponse> {
  const { status, json } = await call('POST', '/staff/trial/start', {
    token,
    ...(company === undefined ? {} : { company }),
  });
  throwUnlessSuccess(status, json, [200]);
  return trialStartResponseSchema.parse(json);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const { status, json } = await call('POST', '/staff/auth/reset-password', { token, password });
  throwUnlessSuccess(status, json, [204]);
}

/** Whose invitation a join link is, and which company it is for. */
export async function previewInvite(inviteToken: string): Promise<PreviewStaffInviteResponse> {
  const { status, json } = await call('POST', '/staff/invites/preview', { inviteToken });
  throwUnlessSuccess(status, json, [200]);
  return previewStaffInviteResponseSchema.parse(json);
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

export async function me(accessToken: string): Promise<StaffMeDto> {
  const { status, json } = await call('GET', '/staff/me', undefined, accessToken);
  throwUnlessSuccess(status, json, [200]);
  return staffMeSchema.parse(json);
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
