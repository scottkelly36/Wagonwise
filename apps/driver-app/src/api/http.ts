import { config } from '../config';
import { ApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  readonly body?: unknown;
  /** Forwarded to the BFF unchanged, as `Authorization: <value>` — mirrors the BFF's own
   *  core-client.ts, which forwards it unchanged to core in turn (decision 1, "verify twice"). */
  readonly authorization?: string;
}

interface JsonResponse {
  readonly status: number;
  readonly json: unknown;
}

/** One function covering every verb, same reasoning as the BFF's own `core-client.ts` (M4.4) —
 *  identity only ever POSTs, routing needs GET/PUT/DELETE too, so this is shared rather than
 *  each API module hand-rolling its own fetch wrapper. */
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

  const response = await fetch(`${config.bffUrl}${path}`, init);
  const contentLength = response.headers.get('content-length');
  const json: unknown =
    response.status === 204 || contentLength === '0' ? undefined : await response.json();
  return { status: response.status, json };
}

/** Throws an `ApiError` unless `status` is one of `successStatuses` — every route in this
 *  codebase sends `{ tag, requestId, ...extra }` on failure (see api/errors.ts). */
export function throwUnlessSuccess(status: number, json: unknown, successStatuses: number[]): void {
  if (successStatuses.includes(status)) return;
  const body = json as { tag?: string; attemptsRemaining?: number } | undefined;
  throw new ApiError(body?.tag ?? 'UnknownError', status, body?.attemptsRemaining);
}
