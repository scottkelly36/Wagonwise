import { checkEmail, type EmailCheck } from '@wagonwise/contracts/email-check';
import { useState, type ReactNode } from 'react';

import { ErrorText, Hint, LinkButton } from './form-kit';

/**
 * What a driver is asked before a code is sent to an email that looks mistyped (gmial.com, gmail.comg). Most such slips are only a
 * guess, so a driver can say the address is right; an ending that does not exist cannot be kept, as nothing could arrive there.
 */
function Question({
  check,
  email,
  onUse,
  onKeep,
}: {
  readonly check: Exclude<EmailCheck, { kind: 'ok' }>;
  readonly email: string;
  readonly onUse: (suggestion: string) => void;
  readonly onKeep: () => void;
}) {
  const suggestion = check.suggestion;
  if (check.kind === 'suggest') {
    return (
      <>
        <Hint>Did you mean {suggestion}?</Hint>
        <LinkButton
          label="Yes, use it"
          onPress={() => onUse(check.suggestion)}
          testID="email-use-suggestion"
        />
        <LinkButton label="No, keep mine" onPress={onKeep} testID="email-keep-mine" />
      </>
    );
  }
  const ending = email.slice(email.lastIndexOf('.') + 1);
  return (
    <>
      <ErrorText testID="email-impossible">
        {`Emails can't end in ".${ending}", so a code sent there would not get through.`}
        {suggestion === undefined ? ' Please check it.' : ` Did you mean ${suggestion}?`}
      </ErrorText>
      {suggestion !== undefined && (
        <LinkButton
          label="Yes, use it"
          onPress={() => onUse(suggestion)}
          testID="email-use-suggestion"
        />
      )}
    </>
  );
}

/**
 * Checks an email for a slip just before it is sent. `review(send)` calls `send` when the address is fine (or the driver has said it
 * is right), and otherwise puts a question in `prompt`, to be shown under the email box, and waits. Answering "Yes, use it" puts the
 * corrected address in the box for the driver to send; "No, keep mine" sends what they typed.
 */
export function useEmailReview(email: string, setEmail: (email: string) => void) {
  const typed = email.trim();
  const [asked, setAsked] = useState<
    { email: string; check: EmailCheck; send: () => void } | undefined
  >(undefined);
  const [kept, setKept] = useState<string | undefined>(undefined);

  function review(send: () => void): void {
    const check = checkEmail(typed);
    if (check.kind === 'ok' || (check.kind === 'suggest' && kept === typed)) {
      setAsked(undefined);
      send();
      return;
    }
    setAsked({ email: typed, check, send });
  }

  // The question is about the address as it was typed: change the address and the question goes.
  const showing = asked !== undefined && asked.email === typed ? asked : undefined;
  const prompt: ReactNode =
    showing === undefined || showing.check.kind === 'ok' ? null : (
      <Question
        check={showing.check}
        email={typed}
        onUse={(suggestion) => {
          setAsked(undefined);
          setEmail(suggestion);
        }}
        onKeep={() => {
          setKept(typed);
          setAsked(undefined);
          showing.send();
        }}
      />
    );
  return { review, prompt };
}
