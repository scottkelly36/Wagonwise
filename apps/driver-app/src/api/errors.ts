// Every identity route sends { tag, requestId, ...extra } on failure (packages/contracts'
// identityErrorResponseSchema, plus fields like OtpIncorrect's attemptsRemaining that aren't
// in the shared schema since they're presentation-only, not part of the wire contract other
// consumers need). Thrown, not a Result — this app has no domain layer of its own to keep
// dependency-free; screens catch this directly.
export class IdentityApiError extends Error {
  readonly tag: string;
  readonly status: number;
  readonly attemptsRemaining: number | undefined;

  constructor(tag: string, status: number, attemptsRemaining?: number) {
    super(`identity API error: ${tag} (${status})`);
    this.name = 'IdentityApiError';
    this.tag = tag;
    this.status = status;
    this.attemptsRemaining = attemptsRemaining;
  }
}
