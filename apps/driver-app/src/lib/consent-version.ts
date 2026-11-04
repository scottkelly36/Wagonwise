import type { DriverInfo } from '../state/auth-store';

/**
 * The version of the privacy summary the driver has to have accepted. Change it when the text on the consent screen changes in a way a
 * driver should be asked about again (a new thing done with their data, such as SOS); an existing driver is then shown the screen once,
 * on their next launch. It is kept on the phone beside the cached driver, so no server data is cleared and the date they first accepted
 * stays on record.
 */
export const CONSENT_VERSION = '2026-11-04';

/** Whether the consent screen is due: never accepted, or accepted before the current version (or on a phone that has no record of it). */
export function needsConsent(driver: Pick<DriverInfo, 'consentedAt' | 'consentVersion'>): boolean {
  return driver.consentedAt === undefined || driver.consentVersion !== CONSENT_VERSION;
}
