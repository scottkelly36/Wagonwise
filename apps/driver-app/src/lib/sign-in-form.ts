import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@wagonwise/contracts/identity';

/**
 * What is wrong with a password before it is sent, in a sentence, or `undefined` when it is fine. The server checks the same three
 * things and is the one that decides; this is so a driver is told as they type, not after waiting for a code to arrive.
 */
export function passwordProblem(password: string, email: string): string | undefined {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. A few words in a row is easy to remember and hard to guess.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return "Your password can't be the same as your email.";
  }
  return undefined;
}

/** A loose check that something is an email address: the server's check is the real one. */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** An account made with a phone number has no email yet, which password sign-in needs (the code goes to it). */
export function needsEmail(identifier: string): boolean {
  return !identifier.includes('@');
}
