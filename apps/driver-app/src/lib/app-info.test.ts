import { formatDeviceInfo } from './app-info';

describe('formatDeviceInfo', () => {
  it('joins the OS name and version with a space', () => {
    expect(formatDeviceInfo('ios', '17.2')).toBe('ios 17.2');
  });

  it('accepts a numeric OS version (Android)', () => {
    expect(formatDeviceInfo('android', 34)).toBe('android 34');
  });
});
