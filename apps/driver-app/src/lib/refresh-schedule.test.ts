import { REFRESH_MARGIN_MS, refreshDelayMs, shouldRefreshOnResume } from './refresh-schedule';

describe('refreshDelayMs', () => {
  it('waits until REFRESH_MARGIN_MS before the real expiry', () => {
    const now = 1_000_000;
    const expiry = now + 10 * 60 * 1000; // 10 minutes away
    expect(refreshDelayMs(expiry, now)).toBe(10 * 60 * 1000 - REFRESH_MARGIN_MS);
  });

  it('never returns negative — an already-past expiry refreshes immediately', () => {
    const now = 1_000_000;
    const expiry = now - 60 * 1000; // already expired a minute ago
    expect(refreshDelayMs(expiry, now)).toBe(0);
  });

  it('refreshes immediately when the expiry is unreadable', () => {
    expect(refreshDelayMs(undefined, Date.now())).toBe(0);
  });
});

describe('shouldRefreshOnResume', () => {
  it('is false when comfortably inside the margin', () => {
    const now = 1_000_000;
    const expiry = now + 10 * 60 * 1000;
    expect(shouldRefreshOnResume(expiry, now)).toBe(false);
  });

  it('is true once within REFRESH_MARGIN_MS of expiry', () => {
    const now = 1_000_000;
    const expiry = now + REFRESH_MARGIN_MS;
    expect(shouldRefreshOnResume(expiry, now)).toBe(true);
  });

  it('is true once already past expiry', () => {
    const now = 1_000_000;
    const expiry = now - 1;
    expect(shouldRefreshOnResume(expiry, now)).toBe(true);
  });

  it('is true when the expiry is unreadable — treat unknown as due', () => {
    expect(shouldRefreshOnResume(undefined, Date.now())).toBe(true);
  });
});
