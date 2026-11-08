import { looksLikeEmail, needsEmail, passwordProblem } from './sign-in-form';

describe('passwordProblem', () => {
  it('accepts ten characters or more', () => {
    expect(passwordProblem('a long enough one', 'a@example.com')).toBeUndefined();
    expect(passwordProblem('1234567890', 'a@example.com')).toBeUndefined();
  });

  it('asks for more when it is too short', () => {
    expect(passwordProblem('short', 'a@example.com')).toMatch(/at least 10/);
  });

  it('refuses one that is far too long', () => {
    expect(passwordProblem('x'.repeat(129), 'a@example.com')).toMatch(/at most 128/);
  });

  it('refuses the email itself, whatever the case or spaces', () => {
    expect(passwordProblem('Driver@Example.com', ' driver@example.com ')).toMatch(
      /same as your email/,
    );
  });
});

describe('looksLikeEmail', () => {
  it('wants something@something.something', () => {
    expect(looksLikeEmail('a@example.com')).toBe(true);
    expect(looksLikeEmail(' a@example.com ')).toBe(true);
    expect(looksLikeEmail('a@example')).toBe(false);
    expect(looksLikeEmail('07700 900123')).toBe(false);
  });
});

describe('needsEmail', () => {
  it('is true for a phone-number account and false for an email one', () => {
    expect(needsEmail('+447700900123')).toBe(true);
    expect(needsEmail('a@example.com')).toBe(false);
  });
});
