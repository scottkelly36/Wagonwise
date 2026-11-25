import { describe, expect, it } from 'vitest';
import { isDisposableEmail } from './disposable-email.js';

describe('isDisposableEmail', () => {
  it.each([
    'sam@mailinator.com',
    'Sam@MAILINATOR.COM',
    'x@yopmail.com',
    'x@guerrillamail.com',
    'x@sharklasers.com',
    'x@10minutemail.com',
    'x@temp-mail.org',
    'x@trashmail.com',
  ])('turns away %s', (email) => {
    expect(isDisposableEmail(email)).toBe(true);
  });

  it('turns away a subdomain of a throwaway provider too', () => {
    expect(isDisposableEmail('x@anything.mailinator.com')).toBe(true);
    expect(isDisposableEmail('x@a.b.yopmail.com')).toBe(true);
  });

  it.each([
    'sam@gmail.com',
    'sam@outlook.com',
    'sam@btinternet.com',
    'dan@smith-haulage.co.uk',
    'office@mailinator-fans.co.uk',
    'sam@notmailinator.com',
  ])('lets %s through', (email) => {
    expect(isDisposableEmail(email)).toBe(false);
  });

  it('says no to something that is not an address, rather than guessing', () => {
    expect(isDisposableEmail('')).toBe(false);
    expect(isDisposableEmail('mailinator.com')).toBe(false);
    expect(isDisposableEmail('+447700900123')).toBe(false);
  });
});
