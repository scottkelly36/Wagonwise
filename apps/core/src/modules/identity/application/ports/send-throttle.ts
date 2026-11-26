/**
 * How often a sign-in code may be sent, so the sign-in routes cannot be used to flood someone's phone or inbox, or to run up the text
 * message bill. Asked once, before a code is made, with the identifier in the form the account is stored under, so 07700 900123 and
 * +44 7700 900123 share one count. The answer is the same whether or not the identifier has an account.
 */
export type SendVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      /** `too_often`: this address or number had a code a moment ago, or too many this hour. `sms_budget`: today's texts are used up. */
      readonly reason: 'too_often' | 'sms_budget';
      readonly retryAfterSeconds: number;
    };

export interface SendThrottle {
  /** Records the send when it is allowed. */
  check(identifier: string): SendVerdict;
}
