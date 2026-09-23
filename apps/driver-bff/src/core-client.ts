export interface CoreResponse {
  readonly status: number;
  readonly body: unknown;
}

export type CoreMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface CoreRequestOptions {
  readonly body?: unknown;
  /** Forwarded to core unchanged, as `Authorization: <value>` — core does its own authoritative
   *  re-verification and derives `driverId`/`reporterId` from it (decision 1, "verify twice").
   *  Identity's own calls to core never set this; core's identity routes don't require it. */
  readonly authorization?: string;
}

export interface CoreClient {
  request(
    method: CoreMethod,
    path: string,
    requestId: string,
    options?: CoreRequestOptions,
  ): Promise<CoreResponse>;
}

/**
 * Every call to core carries `X-Internal-Key` (decision 11 — core is not publicly exposed) and
 * the same `X-Request-Id` the BFF is handling, so one request can be followed across services in
 * the logs (design doc §8). Thin on purpose (AGENTS.md rule 10): this shapes nothing, decides
 * nothing, just forwards and relays core's own status and body back unchanged. One method
 * covering every verb (M4.4 — routing and hazards need `GET`/`PUT`/`DELETE`, not just `POST`),
 * rather than one method per verb.
 *
 * `fetchFn` defaults to the global `fetch` and exists so tests can inject a fake one, the same
 * DI-over-mocking convention the rest of this codebase uses for anything external.
 */
export function createCoreClient(
  coreInternalUrl: string,
  coreInternalKey: string,
  fetchFn: typeof fetch = fetch,
): CoreClient {
  return {
    async request(
      method: CoreMethod,
      path: string,
      requestId: string,
      options: CoreRequestOptions = {},
    ): Promise<CoreResponse> {
      const headers: Record<string, string> = {
        'x-internal-key': coreInternalKey,
        'x-request-id': requestId,
      };
      if (options.authorization !== undefined) {
        headers.authorization = options.authorization;
      }
      const init: RequestInit = { method, headers };
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }

      const response = await fetchFn(`${coreInternalUrl}${path}`, init);
      const contentLength = response.headers.get('content-length');
      const responseBody: unknown =
        response.status === 204 || contentLength === '0' ? undefined : await response.json();
      return { status: response.status, body: responseBody };
    },
  };
}
