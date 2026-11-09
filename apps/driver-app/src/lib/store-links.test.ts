import { APP_STORE_URL, PLAY_STORE_APP_URL, PLAY_STORE_WEB_URL, shareMessage } from './store-links';

describe('store links', () => {
  it('points the Play Store app and the web page at the same listing', () => {
    expect(PLAY_STORE_APP_URL).toBe('market://details?id=com.wagonwise.driverapp');
    expect(PLAY_STORE_WEB_URL).toBe(
      'https://play.google.com/store/apps/details?id=com.wagonwise.driverapp',
    );
  });

  it('has the App Store listing', () => {
    expect(APP_STORE_URL).toBe('https://apps.apple.com/gb/app/id6827935469');
  });

  it('shares both store links in one message, so it works for whoever receives it', () => {
    const message = shareMessage();
    expect(message).toContain(`iPhone: ${APP_STORE_URL}`);
    expect(message).toContain(`Android: ${PLAY_STORE_WEB_URL}`);
    expect(message).toContain('sat nav for HGV drivers');
  });

  it('has one link for each store and nothing else that looks like a link', () => {
    expect(shareMessage().match(/https?:\/\/\S+/g)).toEqual([APP_STORE_URL, PLAY_STORE_WEB_URL]);
  });
});
