/**
 * Expected failures are values (AGENTS.md rule 13). A use case returns `Result<T, E>` where `E`
 * is a union of tagged domain errors, e.g. `{ tag: 'VehicleTooTall'; limitM: number }`.
 * Bugs and infrastructure faults are not Results — they throw.
 *
 * Hand-rolled rather than a library so the domain keeps zero dependencies.
 */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Every domain error carries a discriminating `tag`; `interface/` maps tags to HTTP status. */
export interface TaggedError<Tag extends string = string> {
  readonly tag: Tag;
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Chain a step that can itself fail. The error type widens to cover both steps. */
export function andThen<T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? fn(result.value) : result;
}
