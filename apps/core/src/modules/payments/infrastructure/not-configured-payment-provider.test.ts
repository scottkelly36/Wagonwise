import { describe, expect, it } from 'vitest';
import { NotConfiguredPaymentProvider } from './not-configured-payment-provider.js';

describe('NotConfiguredPaymentProvider', () => {
  const provider = new NotConfiguredPaymentProvider();

  it('offers nothing', () => {
    expect(provider.available).toBe(false);
    expect(provider.name).toBe('none');
  });

  it('cannot start a setup page or collect', async () => {
    await expect(provider.createSetupSession()).rejects.toThrow();
    await expect(provider.collect()).rejects.toThrow();
  });

  it('refuses every message as not signed, so a stray request to the webhook does nothing', () => {
    expect(provider.readEvent()).toEqual({ ok: false });
  });
});
