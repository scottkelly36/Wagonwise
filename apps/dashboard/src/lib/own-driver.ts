import type { DriverLinkDto } from '@wagonwise/contracts/fleet';

/** Whether the signed-in person already drives for their own firm: `active` (linked), `invited` (waiting for them to accept in the app), or `none`. */
export type OwnDriverState = 'none' | 'invited' | 'active';

/**
 * An owner-driver runs the firm in the portal and drives for it in the app, so they are both. The portal knows them by the email they
 * signed in with, and the app by the email or phone number they signed up with; the link between the two is a driver link made for
 * that email. This says where it has got to, from the firm's driver links.
 */
export function ownDriverState(
  links: readonly Pick<DriverLinkDto, 'status' | 'invitedIdentifier' | 'driverIdentifier'>[],
  email: string,
): OwnDriverState {
  const mine = email.trim().toLowerCase();
  const matching = links.filter(
    (l) => (l.invitedIdentifier ?? l.driverIdentifier ?? '').trim().toLowerCase() === mine,
  );
  if (matching.some((l) => l.status === 'active')) return 'active';
  if (matching.some((l) => l.status === 'invited' || l.status === 'requested')) return 'invited';
  return 'none';
}
