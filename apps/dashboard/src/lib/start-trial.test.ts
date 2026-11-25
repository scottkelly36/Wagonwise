import { describe, expect, it } from 'vitest';
import { startTrialOutcome } from './start-trial';

describe('startTrialOutcome', () => {
  it('says where the invitation went when the trial has started', () => {
    const outcome = startTrialOutcome('started', 'sam@carter.example.com');
    expect(outcome.title).toBe('Your trial has started');
    expect(outcome.text).toContain('sam@carter.example.com');
    expect(outcome.text).toContain('spam');
    expect(outcome.signIn).toBe(false);
  });

  it('offers sign-in when the trial was already started or the address already has an account', () => {
    expect(startTrialOutcome('already_started', 'sam@carter.example.com').signIn).toBe(true);
    expect(startTrialOutcome('email_in_use', 'sam@carter.example.com').signIn).toBe(true);
  });

  it('tells a held firm it will be set up shortly, and promises nothing more', () => {
    const outcome = startTrialOutcome('waiting', 'sam@carter.example.com');
    expect(outcome.text).toContain('shortly');
    expect(outcome.text).not.toMatch(/working day|hour|today/);
  });

  it('says an expired or used link is dead and how to get another', () => {
    const outcome = startTrialOutcome('invalid', undefined);
    expect(outcome.title).toBe('This link has expired');
    expect(outcome.text).toContain('Register again');
  });

  it('copes with no address known', () => {
    expect(startTrialOutcome('waiting', undefined).text).toContain('your email address');
  });
});
