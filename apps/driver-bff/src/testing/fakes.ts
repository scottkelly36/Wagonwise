import type { AccessTokenClaims, AccessTokenVerifier } from '../auth/access-token-verifier.js';
import type { CoreClient, CoreMethod, CoreRequestOptions, CoreResponse } from '../core-client.js';

export interface CoreClientCall {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly requestId: string;
  readonly authorization: string | undefined;
}

/** Shared by every route test file (identity, routing, hazards) — a flat app has no per-module
 *  test-double convention to mirror, so one fake per external port is enough. */
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

export class FakeAccessTokenVerifier implements AccessTokenVerifier {
  claimsByToken = new Map<string, AccessTokenClaims>();

  verify(token: string): Promise<AccessTokenClaims> {
    const claims = this.claimsByToken.get(token);
    if (!claims) {
      return Promise.reject(new Error('invalid token'));
    }
    return Promise.resolve(claims);
  }
}
