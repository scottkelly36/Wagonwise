/**
 * The text a person keeps for their recovery codes: the codes, what they are for, and when and for whom they were made, so a file
 * found a year later still explains itself. The codes are shown once only, so this is what Copy and Download hand over.
 */
export function recoveryCodesText(input: {
  readonly codes: readonly string[];
  readonly email?: string | undefined;
  readonly companyName?: string | undefined;
  readonly today: string;
}): string {
  const who = [input.email, input.companyName].filter((part) => part !== undefined && part !== '');
  return [
    'WagonWise recovery codes',
    ...(who.length === 0 ? [] : [who.join(', ')]),
    `Made on ${input.today}`,
    '',
    'Each code works once, in place of a sign-in code, if you lose your phone or authenticator app.',
    'Keep this somewhere safe and private (a password manager is ideal), not in your email.',
    '',
    ...input.codes,
    '',
  ].join('\n');
}

/** Saves text as a file through the browser. Plain text: any editor, phone or printer can open it. */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
