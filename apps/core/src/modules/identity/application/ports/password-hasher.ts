/** Turns a password into something safe to store, and checks a typed one against it. Slow on purpose. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}
