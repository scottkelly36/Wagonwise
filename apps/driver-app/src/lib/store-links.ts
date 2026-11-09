import { PRODUCT_NAME } from '../product';

/** The Android package, which is also the Play listing's id. */
export const ANDROID_PACKAGE = 'com.wagonwise.driverapp';

/** Opens the Play Store app on the listing. */
export const PLAY_STORE_APP_URL = `market://details?id=${ANDROID_PACKAGE}`;

/** The same listing on the web, for a phone with no Play Store app and for sharing. */
export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/** The App Store listing, for iPhone. */
export const APP_STORE_URL = 'https://apps.apple.com/gb/app/id6827935469';

/**
 * What the Share row sends: a line about the app and both store links, whichever phone the sender has, because the person who
 * gets it may have the other kind.
 */
export function shareMessage(): string {
  return `${PRODUCT_NAME} is a sat nav for HGV drivers: routes for your vehicle's size and weight, with hazards ahead.\niPhone: ${APP_STORE_URL}\nAndroid: ${PLAY_STORE_WEB_URL}`;
}
