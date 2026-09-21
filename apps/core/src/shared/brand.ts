declare const brand: unique symbol;

/**
 * A nominal type: `Brand<string, 'DriverId'>` is a string at runtime but not assignable to or
 * from a `HazardReportId`, so mixed-up arguments fail to compile instead of failing in production.
 * Mirrored as zod brands in `packages/contracts` so the brand survives parsing (AGENTS.md rule 14).
 */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type Id<Name extends string> = Brand<string, Name>;

/**
 * The single place a plain string becomes an ID. Callers that get a string from outside the
 * domain (HTTP, the database) should validate it first; this only rejects the empty string,
 * which is never a legitimate ID.
 */
export function makeId<Name extends string>(value: string): Id<Name> {
  if (value.length === 0) {
    throw new Error('An ID cannot be empty');
  }
  return value as Id<Name>;
}
