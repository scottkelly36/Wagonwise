/** How often the owner is emailed about the same limit being reached. A bot or a busy day keeps hitting it for hours, so once is enough. */
export const LIMIT_ALERT_EVERY_MS = 6 * 60 * 60 * 1000;

export type LimitReached = 'new_accounts' | 'texts';

const WORDS: Record<LimitReached, { subject: string; text: string }> = {
  new_accounts: {
    subject: 'Sign-up limit reached: new driver accounts are paused until tomorrow',
    text: [
      "Today's limit on new driver accounts has been reached, so anyone trying to sign up for the first time is being told to try again.",
      'People who already have an account are not affected.',
      '',
      'If this is a genuine surge (a launch, a post that took off), raise NEW_DRIVER_DAILY_LIMIT on core in DigitalOcean. If you did not expect it,',
      'it may be a bot: the Usage page shows new drivers by day, and DRIVER_INVITE_REQUIRED=true on core closes open sign-up at once.',
    ].join('\n'),
  },
  texts: {
    subject: 'Text message limit reached: sign-in codes by text are paused until tomorrow',
    text: [
      "Today's limit on text messages carrying a sign-in code has been reached, so codes to phone numbers are being refused until tomorrow (UTC).",
      'Codes by email still work, and people with an email sign-in are not affected.',
      '',
      'If this is genuine use, raise OTP_SMS_DAILY_LIMIT on core in DigitalOcean. If you did not expect it, someone may be sending codes to numbers to run',
      'up the bill: check the ClickSend account, and DRIVER_INVITE_REQUIRED=true on core closes open sign-up at once.',
    ].join('\n'),
  },
};

/**
 * What to do when a limit on sign-up or on text messages turned someone away: log it, and email the owner at most once every few hours for
 * each kind, so a surge (or a bot) is heard about and the limit is never a silent wall. With no alert address it only logs. A failing email
 * never reaches the caller.
 */
export function limitHandler(deps: {
  readonly now: () => Date;
  readonly log: (what: LimitReached) => void;
  readonly email: ((subject: string, text: string) => Promise<void>) | undefined;
}): (what: LimitReached) => void {
  const lastEmailed = new Map<LimitReached, number>();
  return (what) => {
    deps.log(what);
    if (deps.email === undefined) return;
    const at = deps.now().getTime();
    const last = lastEmailed.get(what);
    if (last !== undefined && at - last < LIMIT_ALERT_EVERY_MS) return;
    lastEmailed.set(what, at);
    deps.email(WORDS[what].subject, WORDS[what].text).catch(() => undefined);
  };
}
