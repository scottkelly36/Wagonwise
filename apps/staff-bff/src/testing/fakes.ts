import type { StaffTokenClaims, StaffTokenVerifier } from '../auth/staff-token-verifier.js';
import type { CoreClient, CoreMethod, CoreRequestOptions, CoreResponse } from '../core-client.js';

export interface CoreClientCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly requestId: string;
  readonly authorization: string | undefined;
}

export class FakeCoreClient implements CoreClient {
  readonly calls: CoreClientCall[] = [];
  nextResponse: CoreResponse = { status: 200, body: { ok: true } };

  request(
    method: CoreMethod,
    path: string,
    requestId: string,
    options?: CoreRequestOptions,
  ): Promise<CoreResponse> {
    this.calls.push({
      method,
      path,
      body: options?.body,
      requestId,
      authorization: options?.authorization,
    });
    return Promise.resolve(this.nextResponse);
  }
}

export class FakeStaffTokenVerifier implements StaffTokenVerifier {
  claimsByToken = new Map<string, StaffTokenClaims>();

  verify(token: string): Promise<StaffTokenClaims> {
    const claims = this.claimsByToken.get(token);
    return claims ? Promise.resolve(claims) : Promise.reject(new Error('invalid token'));
  }
}
