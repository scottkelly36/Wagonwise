/** Slow, salted password hashing (scrypt in production: `infrastructure/scrypt-password-hasher.ts`). */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Constant-time; false for a malformed hash rather than throwing. */
  verify(password: string, hash: string): Promise<boolean>;
}
