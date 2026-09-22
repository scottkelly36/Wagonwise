export interface CoreResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface CoreClient {
  post(path: string, body: unknown, requestId: string): Promise<CoreResponse>;
}

/**
 * Every call to core carries `X-Internal-Key` (decision 11 — core is not publicly exposed) and
 * the same `X-Request-Id` the BFF is handling, so one request can be followed across services in
 * the logs (design doc §8). Thin on purpose (AGENTS.md rule 10): this shapes nothing, decides
 * nothing, just forwards and relays core's own status and body back unchanged.
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
    async post(path: string, body: unknown, requestId: string): Promise<CoreResponse> {
      const headers: Record<string, string> = {
        'x-internal-key': coreInternalKey,
        'x-request-id': requestId,
      };
      const init: RequestInit = { method: 'POST', headers };
      if (body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }

      const response = await fetchFn(`${coreInternalUrl}${path}`, init);
      const contentLength = response.headers.get('content-length');
      const responseBody =
        response.status === 204 || contentLength === '0' ? undefined : await response.json();
      return { status: response.status, body: responseBody };
    },
  };
}
