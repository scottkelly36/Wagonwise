import { PRODUCT_NAME } from '../product';

/** The Android package, which is also the Play listing's id. */
export const ANDROID_PACKAGE = 'com.wagonwise.driverapp';

/** Opens the Play Store app on the listing. */
export const PLAY_STORE_APP_URL = `market://details?id=${ANDROID_PACKAGE}`;

/** The same listing on the web, for a phone with no Play Store app and for sharing. */
export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

const WEBSITE_URL = 'https://wagon-wise.co.uk';

/** Where a shared message sends the person: the Play listing on Android, the website elsewhere (no App Store listing yet). */
export function shareLink(os: string): string {
  return os === 'android' ? PLAY_STORE_WEB_URL : WEBSITE_URL;
}

export function shareMessage(os: string): string {
  return `${PRODUCT_NAME} is a sat nav for HGV drivers: routes for your vehicle's size and weight, with hazards ahead. ${shareLink(os)}`;
}
