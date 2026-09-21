/** Source of new identifiers, so tests can use deterministic ones. */
export interface IdGenerator {
  /** A new, globally unique identifier (a UUID string). */
  newId(): string;
}
