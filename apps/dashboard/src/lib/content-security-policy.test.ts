import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './content-security-policy';

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy('https://api.wagon-wise.co.uk');
  const directive = (name: string) =>
    policy
      .split('; ')
      .find((d) => d.startsWith(`${name} `))
      ?.split(' ')
      .slice(1);

  it('lets only the page’s own scripts run', () => {
    expect(directive('script-src')).toEqual(["'self'"]);
    expect(policy).not.toContain('unsafe-eval');
  });

  it('lets the page call only the staff server, the postcode lookup and the map provider', () => {
    expect(directive('connect-src')).toEqual([
      "'self'",
      'https://api.wagon-wise.co.uk',
      'https://api.postcodes.io',
      'https://api.maptiler.com',
      'https://demotiles.maplibre.org',
    ]);
  });

  it('names the staff server by its origin, whatever path the setting carries', () => {
    const withPath = contentSecurityPolicy('https://api.wagon-wise.co.uk/staff/');
    expect(withPath).toContain(
      "connect-src 'self' https://api.wagon-wise.co.uk https://api.postcodes.io",
    );
  });

  it('allows no plugins, and keeps forms and the base address on the page’s own site', () => {
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'self'"]);
    expect(directive('form-action')).toEqual(["'self'"]);
  });

  it('refuses a staff server address that is not a URL, so a typo fails the build', () => {
    expect(() => contentSecurityPolicy('api.wagon-wise.co.uk')).toThrow();
  });
});
