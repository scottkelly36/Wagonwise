/**
 * Emails a staff member the link to choose a new password. Implemented through identity's facade, like the invitation email.
 */
export interface ResetMailer {
  send(reset: {
    readonly to: string;
    readonly name: string;
    /** The full link to open, secret included. */
    readonly link: string;
    readonly expiresAt: Date;
  }): Promise<void>;
}
