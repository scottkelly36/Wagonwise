/** Hides most of an email address so it can be logged or put in an alert: `dave@gmail.com` becomes `d***@gmail.com`. The
 *  full address is in the Resend dashboard under the email's id, for whoever needs it. */
export function maskAddress(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 1) return '***';
  return `${address.slice(0, 1)}***${address.slice(at)}`;
}
