/** What Settings' "My job" row says, from the state of the current-job query. */
export type JobEntry =
  | { readonly kind: 'checking' }
  | { readonly kind: 'job'; readonly reference: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'error' };

interface JobQueryState {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly data: { readonly reference: string } | null | undefined;
}

/**
 * A job wins over everything: if we have one, show it even when the latest check failed (a poll
 * dropping on patchy signal must not make a driver's job disappear). Only with no job in hand do
 * we say "checking", "couldn't check" or "none", and those three are kept apart on purpose: a
 * driver told "no job" when the truth is "couldn't reach the server" would believe nothing was
 * assigned to them.
 */
export function jobEntry(query: JobQueryState): JobEntry {
  if (query.data) return { kind: 'job', reference: query.data.reference };
  if (query.isPending) return { kind: 'checking' };
  if (query.isError) return { kind: 'error' };
  return { kind: 'none' };
}
