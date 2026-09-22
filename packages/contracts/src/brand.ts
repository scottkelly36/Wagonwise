import { z } from 'zod';

/**
 * Mirrors `apps/core/src/shared/brand.ts`'s `Id<Name>` at the wire boundary: a zod schema whose
 * parsed output is nominally typed, so a `DriverId` and a `SessionId` are never accidentally
 * interchangeable even though both are just strings on the wire (AGENTS.md rule 14).
 *
 * This is a *different* brand mechanism from core's own (zod's `.brand()` vs core's unique-symbol
 * `Brand<T, Name>`) — deliberately: this package's types describe the JSON that crosses a wire,
 * not core's internal domain representation. Each side converts between the two at its own
 * boundary (core already does, via `makeId()` in its interface/ routes).
 */
export function brandedId<Name extends string>() {
  return z.string().min(1).brand<Name>();
}
