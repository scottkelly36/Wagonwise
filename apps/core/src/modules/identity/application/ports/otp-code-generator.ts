/** The raw, human-typeable code sent to a driver — never stored raw, only its hash. */
export interface OtpCodeGenerator {
  next(): string;
}
