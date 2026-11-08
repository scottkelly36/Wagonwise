import { useState, type ReactNode } from 'react';

import { ErrorText, Field, Hint, LinkButton, PrimaryButton } from './form-kit';

interface Props {
  /** Where the code was sent, shown so a wrong address is noticed. */
  readonly sentTo: string;
  readonly submitLabel: string;
  readonly busy: boolean;
  /** The sentence to show when the last try failed. */
  readonly error: string | undefined;
  readonly onSubmit: (code: string) => void;
  /** Extra fields that go with the code (a new password), and whether they are filled in. */
  readonly extra?: ReactNode;
  readonly extraReady?: boolean;
  readonly backLabel: string;
  readonly onBack: () => void;
}

/** The "type the code we sent you" step, the same wherever a code is the next thing. */
export function CodeStep({
  sentTo,
  submitLabel,
  busy,
  error,
  onSubmit,
  extra,
  extraReady = true,
  backLabel,
  onBack,
}: Props) {
  const [code, setCode] = useState('');
  const ready = code.trim() !== '' && extraReady;
  return (
    <>
      <Hint>A code has been sent to {sentTo}</Hint>
      <Field
        label="Enter the code"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        testID="code-input"
      />
      {extra}
      {error !== undefined && <ErrorText testID="step-error">{error}</ErrorText>}
      <PrimaryButton
        label={submitLabel}
        disabled={!ready}
        busy={busy}
        onPress={() => onSubmit(code.trim())}
        testID="verify-code-button"
      />
      <LinkButton label={backLabel} onPress={onBack} testID="use-different-identifier-button" />
    </>
  );
}
