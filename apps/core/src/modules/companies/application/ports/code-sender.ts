/**
 * Delivers a one-time code by text (a +44 mobile) or email. Implemented through identity's
 * facade, so staff codes go out through the same ClickSend/Resend accounts drivers' codes do.
 */
export interface CodeSender {
  send(destination: string, code: string): Promise<void>;
}
