/**
 * A new opaque bearer refresh token (the raw value returned to the driver — never stored raw,
 * only its hash). Deliberately its own port rather than reusing the cross-cutting `IdGenerator`:
 * an entity ID and a secret credential are different concerns even when both happen to be
 * generated the same way underneath, and keeping them separate means swapping in a
 * non-cryptographic `IdGenerator` fake somewhere can never accidentally weaken a token.
 */
export interface RefreshTokenGenerator {
  next(): string;
}
