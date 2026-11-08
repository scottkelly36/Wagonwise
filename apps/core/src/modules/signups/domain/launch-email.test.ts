import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  LAUNCH_SUBJECT,
  launchEmailHtml,
  launchEmailText,
  type LaunchEmailInput,
} from './launch-email.js';

const input: LaunchEmailInput = {
  name: 'Sam',
  appStoreLink: 'https://apps.apple.com/gb/app/wagonwise/id1?x=1&y=2',
  playStoreLink: 'https://play.google.com/store/apps/details?id=com.wagonwise.driverapp',
};

describe('launch email', () => {
  it('says what it is in the subject', () => {
    expect(LAUNCH_SUBJECT).toBe('WagonWise is out now on iPhone and Android');
  });

  it('greets by name, or plainly when there is none', () => {
    expect(launchEmailText(input)).toMatch(/^Hello Sam,/);
    expect(launchEmailText({ ...input, name: undefined })).toMatch(/^Hello,/);
    expect(launchEmailHtml({ ...input, name: undefined })).toContain('Hello,');
  });

  it('has both store links in the text and in the HTML buttons, with & escaped in the HTML', () => {
    const text = launchEmailText(input);
    expect(text).toContain(input.appStoreLink);
    expect(text).toContain(input.playStoreLink);
    const html = launchEmailHtml(input);
    expect(html).toContain('href="https://apps.apple.com/gb/app/wagonwise/id1?x=1&amp;y=2"');
    expect(html).toContain(`href="${input.playStoreLink}"`);
    expect(html).toContain('Download on the');
    expect(html).toContain('>App Store<');
    expect(html).toContain('Get it on');
    expect(html).toContain('>Google Play<');
  });

  it("puts each store's mark in its button, as a picture on the website (mail apps do not draw SVG)", () => {
    const html = launchEmailHtml(input);
    expect(html).toContain('src="https://wagon-wise.co.uk/img/store-apple.png"');
    expect(html).toContain('src="https://wagon-wise.co.uk/img/store-play.png"');
  });

  it('never puts a typed name or link into the HTML unescaped', () => {
    const html = launchEmailHtml({
      name: '<script>alert(1)</script>',
      appStoreLink: 'https://x.test/"onmouseover="alert(1)',
      playStoreLink: input.playStoreLink,
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('"onmouseover=');
    expect(html).toContain('&lt;script&gt;');
  });

  it('says where to write, by name, beside "reply to this email", since the sender is a no-reply address', () => {
    const text = launchEmailText(input);
    expect(text).toMatch(/just reply to this email, or write to support@wagon-wise\.co\.uk/);
    expect(launchEmailHtml(input)).toMatch(
      /just reply to this email or write to support@wagon-wise\.co\.uk/,
    );
  });

  it('tells the person why they got it, how to come off the list, and who sent it', () => {
    for (const body of [launchEmailText(input), launchEmailHtml(input)]) {
      expect(body).toContain('because you asked');
      expect(body).toContain('support@wagon-wise.co.uk');
      expect(body).toContain('NE46 3DT');
    }
  });

  it('escapes the five characters that break out of HTML', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});
