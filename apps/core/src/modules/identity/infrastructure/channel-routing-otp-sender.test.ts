import { describe, expect, it, vi } from 'vitest';
import type { OtpSender } from '../application/ports/otp-sender.js';
import { ChannelRoutingOtpSender } from './channel-routing-otp-sender.js';

describe('ChannelRoutingOtpSender', () => {
  it('routes an email identifier to the email sender, not the SMS sender', async () => {
    const smsSend = vi.fn().mockResolvedValue(undefined);
    const emailSend = vi.fn().mockResolvedValue(undefined);
    const router = new ChannelRoutingOtpSender(
      { send: smsSend } satisfies OtpSender,
      { send: emailSend } satisfies OtpSender,
    );

    await router.send('driver@example.com', '123456');

    expect(emailSend).toHaveBeenCalledWith('driver@example.com', '123456');
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('routes a phone identifier to the SMS sender, not the email sender', async () => {
    const smsSend = vi.fn().mockResolvedValue(undefined);
    const emailSend = vi.fn().mockResolvedValue(undefined);
    const router = new ChannelRoutingOtpSender(
      { send: smsSend } satisfies OtpSender,
      { send: emailSend } satisfies OtpSender,
    );

    await router.send('+447123456789', '123456');

    expect(smsSend).toHaveBeenCalledWith('+447123456789', '123456');
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('propagates a rejection from the chosen sender', async () => {
    const smsSend = vi.fn().mockResolvedValue(undefined);
    const emailSend = vi.fn().mockRejectedValue(new Error('boom'));
    const router = new ChannelRoutingOtpSender(
      { send: smsSend } satisfies OtpSender,
      { send: emailSend } satisfies OtpSender,
    );

    await expect(router.send('driver@example.com', '123456')).rejects.toThrow('boom');
  });
});
