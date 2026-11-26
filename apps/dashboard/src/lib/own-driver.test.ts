import { describe, expect, it } from 'vitest';
import { ownDriverState } from './own-driver';

const link = (status: 'invited' | 'requested' | 'active' | 'declined' | 'left', who: string) => ({
  status,
  invitedIdentifier: status === 'invited' ? who : undefined,
  driverIdentifier: status === 'invited' ? undefined : who,
});

describe('ownDriverState', () => {
  const email = 'Alex@Acme.test';

  it('is none when the firm has no link for that email', () => {
    expect(ownDriverState([], email)).toBe('none');
    expect(ownDriverState([link('active', 'sam@acme.test')], email)).toBe('none');
  });

  it('is invited while the invitation waits, and active once accepted, whatever the capitals', () => {
    expect(ownDriverState([link('invited', 'alex@acme.test')], email)).toBe('invited');
    expect(ownDriverState([link('active', ' ALEX@acme.test ')], email)).toBe('active');
  });

  it('counts an accepted link over a waiting one, and ignores declined and left', () => {
    expect(
      ownDriverState([link('invited', 'alex@acme.test'), link('active', 'alex@acme.test')], email),
    ).toBe('active');
    expect(ownDriverState([link('declined', 'alex@acme.test')], email)).toBe('none');
    expect(ownDriverState([link('left', 'alex@acme.test')], email)).toBe('none');
  });
});
