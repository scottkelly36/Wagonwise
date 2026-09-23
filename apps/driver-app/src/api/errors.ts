// Every core/BFF route in this codebase sends { tag, requestId, ...extra } on failure
// (packages/contracts' identityErrorResponseSchema/routingErrorResponseSchema, plus fields like
// OtpIncorrect's attemptsRemaining that aren't in the shared schema since they're presentation-
// only, not part of the wire contract other consumers need). Thrown, not a Result — this app has
// no domain layer of its own to keep dependency-free; screens catch this directly. One class for
// every module (identity, routing, ...) rather than one per module: the shape is identical, and
// a screen only ever needs `error.tag` to pick a message, never which module it came from.
export class ApiError extends Error {
  readonly tag: string;
  readonly status: number;
  readonly attemptsRemaining: number | undefined;

  constructor(tag: string, status: number, attemptsRemaining?: number) {
    super(`API error: ${tag} (${status})`);
    this.name = 'ApiError';
    this.tag = tag;
    this.status = status;
    this.attemptsRemaining = attemptsRemaining;
  }
}
