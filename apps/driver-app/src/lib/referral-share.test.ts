import { shareMessage } from './referral-share';

it('says who it is from, with the link and the code', () => {
  const text = shareMessage('WW-K7Q2MX', 'Dave');
  expect(text).toMatch(/^Dave here\. I use the WagonWise app/);
  expect(text).toContain('https://wagon-wise.co.uk/for-hauliers/');
  expect(text).toContain('WW-K7Q2MX');
  expect(shareMessage('WW-K7Q2MX', null)).toMatch(/^I use/);
});
