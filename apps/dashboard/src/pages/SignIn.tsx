/**
 * Placeholder only — not wired to anything real. Core's identity module is driver-specific
 * (OTP + invite code, `apps/core/src/modules/identity`); a business/dispatcher account is a
 * different, currently undefined concept (no domain model, no endpoint, no decision yet on
 * whether a business user is its own aggregate or reuses `Driver` with a role flag). Building
 * real auth here first would mean guessing at that decision — left as a TODO until it's made
 * deliberately, same as the rest of this app's backend.
 */
export function SignIn() {
  return (
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>Sign in</h1>
      <p>TODO — no real authentication wired up yet.</p>
    </div>
  );
}
