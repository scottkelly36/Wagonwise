import { PLAY_STORE_APP_URL, PLAY_STORE_WEB_URL, shareLink, shareMessage } from './store-links';

describe('store links', () => {
  it('points the Play Store app and the web page at the same listing', () => {
    expect(PLAY_STORE_APP_URL).toBe('market://details?id=com.wagonwise.driverapp');
    expect(PLAY_STORE_WEB_URL).toBe(
      'https://play.google.com/store/apps/details?id=com.wagonwise.driverapp',
    );
  });

  it('shares the Play listing on Android and the website elsewhere', () => {
    expect(shareLink('android')).toBe(PLAY_STORE_WEB_URL);
    expect(shareLink('ios')).toBe('https://wagon-wise.co.uk');
  });

  it('puts the link in the message', () => {
    expect(shareMessage('android')).toContain(PLAY_STORE_WEB_URL);
    expect(shareMessage('ios')).toContain('https://wagon-wise.co.uk');
  });
});
