/** Mirrors driver-app's own `api/errors.ts` exactly — every core/BFF route in this codebase
 *  sends `{ tag, requestId, ...extra }` on failure. */
export class ApiError extends Error {
  readonly tag: string;
  readonly status: number;

  constructor(tag: string, status: number) {
    super(`API error: ${tag} (${status})`);
    this.name = 'ApiError';
    this.tag = tag;
    this.status = status;
  }
}
