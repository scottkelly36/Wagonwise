import { bffUrl } from './config';
import { ApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  readonly body?: unknown;
  readonly authorization?: string;
}

interface JsonResponse {
  readonly status: number;
  readonly json: unknown;
}

/** One function covering every verb — mirrors driver-app's own `api/http.ts` and the BFF's own
 *  `core-client.ts` exactly. */
export async function requestJson(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
): Promise<JsonResponse> {
  const headers: Record<string, string> = {};
  if (options.authorization !== undefined) {
    headers.authorization = options.authorization;
  }
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${bffUrl}${path}`, init);
  const contentLength = response.headers.get('content-length');
  const json: unknown =
    response.status === 204 || contentLength === '0' ? undefined : await response.json();
  return { status: response.status, json };
}

/** Throws an `ApiError` unless `status` is one of `successStatuses` — every route in this
 *  codebase sends `{ tag, requestId, ...extra }` on failure. */
export function throwUnlessSuccess(status: number, json: unknown, successStatuses: number[]): void {
  if (successStatuses.includes(status)) return;
  const body = json as { tag?: string } | undefined;
  throw new ApiError(body?.tag ?? 'UnknownError', status);
}
