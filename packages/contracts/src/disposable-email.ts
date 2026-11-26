/**
 * Providers that hand out an address for a few minutes, so anyone can make any number of accounts. A short list of the best known, not
 * every one there is: it turns away the casual bot and the person who typed the first one they found, and nothing here is a promise to
 * catch all of them. Only ever checked when a NEW account is being made, never against a driver who already has one.
 */
const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'burnermail.io',
  'discard.email',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'fakeinbox.com',
  'fakemail.net',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'grr.la',
  'harakirimail.com',
  'inboxkitten.com',
  'jetable.org',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailinator.net',
  'mailnesia.com',
  'mailnull.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'mytemp.email',
  'nada.email',
  'sharklasers.com',
  'spam4.me',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'tempmailaddress.com',
  'throwawaymail.com',
  'throwam.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'trash-mail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'zetmail.com',
]);

/** Whether an address is at one of the well-known throwaway providers (or a subdomain of one). */
export function isDisposableEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = email.slice(at + 1);
  const labels = domain.split('.');
  // sub.mailinator.com is mailinator.com's too: try the domain and each parent of it that still has a dot.
  for (let i = 0; i < labels.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}
