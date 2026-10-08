/**
 * Emails a staff member their invitation link. Implemented through identity's facade, so it goes out
 * through the same Resend account as sign-in codes.
 */
export interface InviteMailer {
  send(invite: {
    readonly to: string;
    readonly name: string;
    /** The full link to open, secret included. */
    readonly link: string;
    readonly expiresAt: Date;
  }): Promise<void>;
}
