/**
 * The rules around the emailed link that lets a firm start its own free trial (nobody at WagonWise presses a button). The link proves
 * the address is the person's; these limits keep a bot, or one firm signing up twice, from making a pile of trials.
 */

/** How long the link works. Long enough for a busy transport manager to get round to it, short enough that an old email is dead. */
export const TRIAL_LINK_LIFETIME_MS = 48 * 60 * 60 * 1000;

/** Trials started with no one at WagonWise pressing a button, in a UTC day, across everyone. Past it a firm waits for the owner. */
export const AUTO_TRIAL_DAILY_CAP = 10;

/** Registering the same address again sends a fresh link only if the last one is older than this, so no one can use the form to flood an inbox. */
export const LINK_RESEND_AFTER_MS = 60 * 60 * 1000;

/**
 * Addresses at these providers belong to anyone, so "one trial per email domain" would stop every owner-driver after the first. They are
 * limited per address (a sign-up is already one per address); any other domain is one firm, so it is limited to one automatic trial.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'aol.co.uk',
  'btinternet.com',
  'btopenworld.com',
  'bt.com',
  'sky.com',
  'virginmedia.com',
  'ntlworld.com',
  'talktalk.net',
  'tiscali.co.uk',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.co.uk',
  'mail.com',
  'zoho.com',
]);

/** "Sam@Example.COM" is "example.com". */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();
}

export const isFreeMail = (email: string): boolean => FREE_MAIL_DOMAINS.has(emailDomain(email));
