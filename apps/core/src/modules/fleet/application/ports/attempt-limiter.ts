/** Slows down guessing a company's join code: a driver who keeps getting it wrong is turned away
 *  for a while. Per driver, since only a signed-in driver can try. */
export interface AttemptLimiter {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
}
