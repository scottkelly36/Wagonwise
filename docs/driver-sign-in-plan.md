# Driver sign-in without an invite code (plan, 2026-11-01)

Status: **plan, with the server side built behind switches** (see "What is built"). Nothing here changes
what the released app does until a switch is flipped. No app release is planned until after the store
release.

## Today

- A driver signs in with an email or a UK mobile and a one-time code (`POST /identity/otp/request`, then
  `/identity/otp/verify`). Their first sign-in needs an **invite code** (`identity.invite_codes`), which is
  redeemed when the account is made.
- Sessions are an Ed25519 access token plus a rotating refresh token (60 days). The app keeps the refresh
  token, so a sign-in is rare.
- Staff accounts (the portal) already have email, password and a second factor with recovery codes, in the
  `companies` module. The driver side has no passwords at all.

## Decisions (owner, 2026-11-01)

1. **Second factor: an emailed code.** Reuses today's one-time code. (An authenticator app can be added later
   as an extra, as staff have.)
2. **Google and Apple sign-in**, both. Apple's App Store rules effectively require Sign in with Apple once
   Google is offered.
3. Plan first, then the server side behind switches; no app release before the store release.

## Target

| Way in           | Steps                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| New, email       | email + password → code emailed → type it → account made, signed in. No invite code.         |
| Returning, email | email + password → code emailed → type it → signed in.                                       |
| Forgot password  | email → code emailed → code + new password → signed in.                                      |
| Google / Apple   | one tap on the phone gives an ID token → server checks it → signed in. No code, no password. |
| Old way          | email or mobile + code only. Stays for anyone **without a password** (see rules).            |

### Rules that matter

- **A password must close the code-only door.** If an account has a password, `/identity/otp/*` refuses it
  (`PasswordRequired`). Otherwise anyone who can read the inbox could skip the password.
- The password check comes **first and never says which part was wrong** (one error, a decoy hash so a wrong
  email takes as long as a wrong password), then a code. Five wrong passwords lock the account for 15 minutes.
- **Google/Apple link by verified email only.** A token whose `email_verified` is false is refused. A token
  for an email that already has a driver signs into that driver (linked); otherwise a driver is made. The
  link is stored by the provider's stable `sub`, so a later email change at Google does not lose the account.
- Apple may give a private relay address; it is used as the identifier like any other email.
- **Phone-number drivers** keep text-code sign-in until they add an email (the second factor is an emailed
  code, so they need one). Open question: do we want that prompt, or retire phone sign-in? Not blocking.
- A driver who signed up with Google/Apple and no password has nothing to "close": they sign in with the
  provider each time. They can add a password later (same endpoint as migrating drivers).

## Server: what it needs

New tables (migrations `0081_driver_passwords.sql` and `0082_federated_identities.sql`). There is no "pending signup" table: the password is sent
only with the code in the second step, so nobody can plant a password for someone else's email:

- `identity.driver_credentials (driver_id pk → drivers, password_hash, failed_attempts, locked_until, updated_at)`.
- `identity.federated_identities (provider, subject, driver_id, email, created_at; pk (provider, subject))`.

New endpoints (all internal, forwarded unchanged by the driver BFF; **off unless `DRIVER_PASSWORD_SIGN_IN`**):

| Route                                   | Does                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /identity/signup/request`         | `{ email, inviteCode? }` → emails a code (`AccountExists` if there is already a driver)           |
| `POST /identity/signup/confirm`         | `{ email, password, code, inviteCode? }` → makes the driver and password, returns tokens          |
| `POST /identity/password/sign-in`       | `{ identifier, password }` → emails a code; a wrong email or password is one `InvalidCredentials` |
| `POST /identity/password/verify`        | `{ identifier, code }` → tokens                                                                   |
| `POST /identity/password/reset/request` | `{ email }` → emails a code (always 200)                                                          |
| `POST /identity/password/reset/confirm` | `{ email, code, newPassword }` → sets it, ends other sessions, tokens                             |
| `PUT /identity/account/password`        | signed in: `{ password }` for a driver who has none (migrating drivers)                           |
| `POST /identity/social/sign-in`         | `{ provider: 'google' \| 'apple', idToken, inviteCode? }` → tokens                                |

Passwords: scrypt, same parameters as staff (identity gets its own copy of the small hasher, per the rule
that modules do not import each other). Minimum 10 characters, at most 128, no composition rules (length
beats symbols), refused if it is the email itself. ID tokens are checked with `jose` against Google's and
Apple's published keys: signature, issuer, audience (our client ids), expiry.

Switches (read only in `config.ts`):

- `DRIVER_INVITE_REQUIRED` (default `true`). `false` makes a first sign-in work **without a code**, on the
  existing code-only route too. **The released app already sends no code when its box is empty**, so this
  alone opens sign-up for the current build with no app update (the box just stays on screen, labelled
  "first sign-in only").
- `DRIVER_PASSWORD_SIGN_IN` (default `false`): registers the routes above.
- `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_CLIENT_IDS` (comma lists; unset means that provider answers
  `ProviderNotConfigured`).

## App (needs a release, after the store release)

- Password + code screens, forgot password, "Add a password" for existing drivers: **JavaScript only**, so
  these can go over the air.
- Google and Apple buttons need native modules (`expo-apple-authentication`, a Google sign-in module and
  their config plugins): **a store build**, not over the air.
- Sign in with Apple also requires, when an account that used it is deleted, **revoking the Apple token**
  (App Store guideline 5.1.1(v)). That needs the authorization code exchanged on the server and a client
  secret signed with an Apple key. Built with the app work, not in the groundwork.
- Remove the invite-code box once the switch is off for good.

## Owner set-up needed (nothing the code can do)

- **Google Cloud:** a project, an OAuth consent screen, and OAuth client ids for Android (needs the SHA-1 of
  the **Play app-signing key**), iOS, and a web client (the id the server checks as audience).
- **Apple:** turn on Sign in with Apple for the app's App ID (Team ID is already in `eas.json`).
- Privacy notice and the store data-safety forms: add "email address" and "sign-in with Google/Apple".

## Sequence

1. (Done, behind switches) server and migration, deployed any time: with both switches off nothing changes.
2. After the store release: flip `DRIVER_INVITE_REQUIRED=false` if open sign-up is wanted immediately
   (works with the released app).
3. App update: password screens (over the air) and Google/Apple (store build). Then
   `DRIVER_PASSWORD_SIGN_IN=true`.
4. Prompt existing drivers to add a password; later consider closing the code-only route for new accounts.
5. Retire the tester sign-up list, invite-code screens and the invite box.

## Risks

- **Open sign-up means anyone can create accounts:** each email code costs a send (a code lasts 10 minutes and
  allows 5 guesses), and the account lockout stops password guessing. **The driver BFF has no per-address rate
  limit** (the staff BFF has), so a flood of sign-up requests is not slowed down: add one before opening
  sign-up widely. Disposable-email blocking and a per-day cap on new accounts are not built either.
- Email deliverability is now part of signing in. The sender domain must be verified with Resend (the
  sandbox sender only delivers to the owner).
- Social sign-in skips our code step, by design (the provider has already done its own).
- **The inbox is the real key.** Because a forgotten password is reset by an emailed code, someone who controls
  the inbox can get in with or without the password. The password and code together protect against a reused
  or leaked password, not a hijacked inbox. An authenticator app as a second factor (as staff have) would
  fix that, and is left as a later extra.

## What is built (2026-11-01: server and driver BFF only, nothing in the app)

- `DRIVER_INVITE_REQUIRED`, `DRIVER_PASSWORD_SIGN_IN`, `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_CLIENT_IDS` in `config.ts`.
- Core: every route in the table above and `POST /identity/social/sign-in`, forwarded by the driver BFF. A driver
  with a password is refused on the code-only routes (`PasswordRequired`). Account deletion removes the password
  and the provider links.
- Tests: unit, routes, real-Postgres repositories, and `composition/driver-sign-in-end-to-end.test.ts` through
  the real module.
- **Not built:** anything in the app; revoking the Apple token when an account is deleted; a nonce check on ID
  tokens (a stolen token could be replayed until it expires, about an hour); a per-address rate limit at the driver
  BFF; disposable-email blocking.

Details: `docs/modules.md` (Identity) and the 2026-11-01 entry in `docs/history/log.md`.
