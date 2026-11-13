/**
 * The Content-Security-Policy put in the built portal's `index.html`.
 *
 * DigitalOcean's static hosting cannot set response headers, so the policy goes in a `<meta>` tag at
 * build time. A meta policy cannot carry `frame-ancestors`, `report-uri` or `sandbox`, so framing is
 * not covered here (the page has no sensitive one-click actions to hijack, but it is a gap).
 *
 * What it buys: only the portal's own scripts run (no inline script, no script from elsewhere), and
 * the page can talk only to the staff server, the postcode lookup and the map provider, so injected
 * markup cannot send a staff token anywhere else. Styles allow `'unsafe-inline'` because React sets
 * style attributes and MapLibre sets styles on its elements; scripts do not.
 *
 * Every host named here is one the portal really calls. Add a call to a new host and it will be
 * blocked until it is listed.
 */
export function contentSecurityPolicy(staffBffUrl: string): string {
  const staffServer = new URL(staffBffUrl).origin;
  const mapHosts = ['https://api.maptiler.com', 'https://demotiles.maplibre.org'];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${mapHosts.join(' ')}`,
    "font-src 'self' data:",
    `connect-src 'self' ${staffServer} https://api.postcodes.io ${mapHosts.join(' ')}`,
    // MapLibre decodes tiles in a worker, some of which it starts from a blob.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
