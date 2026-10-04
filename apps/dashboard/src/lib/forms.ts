/** A form's problems, keyed by field. A field with no entry is fine. */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Deliberately loose: something@something.tld. The server and the mail provider are the real check;
 *  this only catches the obvious slips (a missing @, a space, no domain) with a clear message. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function hasErrors(errors: FieldErrors<string>): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * After a failed submit, moves the cursor to the first field that is wrong, so the person sees
 * what to fix without hunting. Fields mark themselves with `aria-invalid`. Runs on the next frame
 * because the error messages and the `aria-invalid` attributes only appear after React re-renders.
 */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  if (form === null) return;
  requestAnimationFrame(() => {
    form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });
}

// Same rule as core's `normalizeIdentifier` (identity/domain/identifier.ts): spaces, hyphens and
// brackets are ignored, then 8 to 15 digits with an optional leading +.
const PHONE = /^\+?\d{8,15}$/;

export function isPhone(value: string): boolean {
  return PHONE.test(value.trim().replace(/[\s\-()]/g, ''));
}

/** What is wrong with a driver's phone-or-email, in words a dispatcher can act on; undefined if fine. */
export function identifierError(value: string): string | undefined {
  const text = value.trim();
  if (text === '') return "Enter the driver's mobile number or email address.";
  if (text.includes('@')) {
    return isEmail(text)
      ? undefined
      : 'That does not look like an email address. Check it is like name@example.com.';
  }
  return isPhone(text)
    ? undefined
    : 'Enter a phone number, like 07700 900123, or an email address.';
}
