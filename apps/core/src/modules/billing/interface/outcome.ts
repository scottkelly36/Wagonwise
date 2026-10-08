/** What a billing route handler returns: the HTTP status, and a body when there is one. */
export interface Outcome {
  readonly status: number;
  readonly body?: object;
}
