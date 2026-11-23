import type { PaymentProvider } from '../application/ports/payment-provider.js';

/**
 * Used until a payment provider is connected (the owner has to open the account first). Nothing is available: the portal offers no "add
 * payment details", no invoice can be collected, and every message is refused as not signed, so a stray request to the webhook does
 * nothing at all.
 */
export class NotConfiguredPaymentProvider implements PaymentProvider {
  readonly name = 'none';
  readonly available = false;

  createSetupSession(): Promise<never> {
    return Promise.reject(new Error('no payment provider is connected'));
  }

  collect(): Promise<never> {
    return Promise.reject(new Error('no payment provider is connected'));
  }

  readEvent(): { readonly ok: false } {
    return { ok: false };
  }
}
