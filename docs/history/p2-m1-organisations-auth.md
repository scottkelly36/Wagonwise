# P2-M1 Organisations, roles, RLS, staff auth + 2FA

Scoped 2026-09-28 from the [Phase 2 tech design doc](https://claude.ai/artifact/LK2oYrVSwotj7E8W9tXykD)
§4 and §9, plus its decision log's proposed 3-tier permission model. **Status: in progress. P2-M1.1
(contracts), P2-M1.2 (domain rules), P2-M1.3 (storage), P2-M1.4 (crypto building blocks)
P2-M1.5 (use cases), P2-M1.6 (staff tokens + routes), P2-M1.7 (RLS), P2-M1.8 (policies in use cases) done 2026-09-28; P2-M1.9 (staff BFF)
P2-M1.10 (dashboard staff pages) and P2-M1.11 (audit log) done 2026-09-29.**

**Decision 2026-09-28 (user's call, option 1 of 3): interim driver scopes first, staff accounts
on top later.** A first fleet slice was built outside this plan (PR #48, branch `phase-2/m1`):
company vehicles plus a `scopes` list on the `Driver` account (`manage_fleet` only), using the
existing driver OTP sign-in. It ships as-is, as an early P2-M2 (fleet). This plan still stands.
Staff accounts, TOTP, RLS and application-layer policies are built on top of it, and P2-M1.12's
cutover moves driver scopes onto fleet-user privileges (see "Carrying over the interim scopes"
below). The open decisions were answered the same day (see Decisions, bottom).

Started knowingly ahead of the doc's entry criteria (a month of real drivers, trusted hazard
density, a pilot firm signed up). None of them are met yet (user's call, 2026-09-28).

## Starting point (what exists)

- `companies` module: `Company { id, name, createdAt }`, one migration (0014), create/list
  routes. Admin-only via an `AdminDirectory` port that reads `identity.drivers.is_admin`.
- `identity.drivers.company_id` (0015): a driver belongs to at most one company.
- `identity.drivers.is_admin` (0012): the only notion of "WagonWise staff" today.
- `apps/dashboard` signs in with **driver** email/SMS OTP and calls **driver-bff** for its admin
  routes. Its fleet pages are placeholders.
- Admin checks live in `interface/routes.ts` (companies, hazards, identity) as
  `if (!isAdmin) return 403`. That's not the application-layer policy the Phase 2 doc asks for.
- **Interim (PR #48):** `identity.drivers.scopes` (0018, jsonb, `['manage_fleet']` max) and a
  `fleet` module (0019, `fleet.vehicles`). A non-admin driver with a `companyId` can view their
  company's vehicles; `manage_fleet` lets them create/edit/delete them. Checks live in
  `fleet/application/authorization.ts` (`canViewFleet`/`canManageFleet`), called from the routes.
  The dashboard admits any driver with `isAdmin` or at least one scope.
- Access tokens carry only `sub` (driverId) and `sid`. Nothing tells a driver token apart from a
  staff token.
- **Core connects as the `wagonwise` role, which owns every table** (and is a superuser in the
  local `postgis` image). Postgres skips RLS for superusers and table owners, so policies added
  as things stand would pass every test and protect nothing.

## Model

Three account types, replacing the bare `isAdmin` flag:

| Account         | Scope                      | Signs in with                 | Where it lives                        |
| --------------- | -------------------------- | ----------------------------- | ------------------------------------- |
| WagonWise staff | Unscoped (all companies)   | email + password + 2nd factor | `staff` accounts, `kind = 'platform'` |
| Fleet user      | One company                | email + password + 2nd factor | `staff` accounts, `kind = 'fleet'`    |
| Driver          | Own data; optional company | email/SMS OTP (unchanged)     | `identity.drivers` (unchanged)        |

**Privileges are a fixed list WagonWise defines** (the decision log's accepted pushback: not
free text, "manager" is a privilege, not a role):

| Privilege        | Allows                                           | Used from |
| ---------------- | ------------------------------------------------ | --------- |
| `manage_users`   | Invite fleet users, set their privileges, remove | P2-M1     |
| `manage_fleet`   | Vehicles, driver links                           | P2-M2     |
| `dispatch`       | Create / assign / cancel jobs                    | P2-M3     |
| `view_live_map`  | Live fleet map                                   | P2-M6     |
| `view_reports`   | Reports and CSV export                           | P2-M8     |
| `manage_billing` | Billing                                          | later     |

The doc's Owner / Dispatcher / Viewer roles become **presets** in the dashboard's invite form
(Owner = all; Dispatcher = fleet + dispatch + map + reports; Viewer = map + reports). They're
stored as privileges, not roles.

**Domain rules (pure, exhaustively tested, like `applies()`):**

- A fleet user can only act inside their own company. No use case takes a company id without
  an actor, and a fleet actor's company always wins over any id in the request.
- A fleet user can only grant privileges they hold themselves.
- A company must always keep at least one user with `manage_users`. Removing or demoting the
  last one is a `Result` error (`LastManager`), not a lockout.
- Platform staff can do anything a manager can, in any company, and are the only ones who can
  create companies or delete hazards (today's admin actions).
- Drivers never gain staff privileges. The account types stay separate even when it's the same
  person.

## Tasks

One per session, each with its tests.

| #        | Task                                                                                                                                                  | Status            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| P2-M1.1  | `packages/contracts`: `StaffAccount`, `Privilege` enum, staff auth + invite DTOs, branded `StaffId`                                                   | Done — 2026-09-28 |
| P2-M1.2  | Core domain: `StaffAccount` aggregate, `Actor` type, `can(actor, action)` policy functions + the rules above                                          | Done — 2026-09-28 |
| P2-M1.3  | Core: migration (`companies.staff_accounts`, `staff_invites`, `staff_sessions`), Postgres repositories                                                | Done — 2026-09-28 |
| P2-M1.4  | Core: password hashing (`scrypt`, node crypto — no dependency), TOTP (RFC 6238, hand-rolled), and SMS/email codes via identity's facade, behind ports | Done — 2026-09-28 |
| P2-M1.5  | Core use cases: invite, accept invite (set password + enrol a second factor), sign in, refresh, revoke, set privileges, remove user                   | Done — 2026-09-28 |
| P2-M1.6  | Token claims gain `kind: 'driver' \| 'staff'`; driver routes reject staff tokens and vice versa                                                       | Done — 2026-09-28 |
| P2-M1.7  | **RLS**: non-owner `wagonwise_app` DB role, policies on company-owned tables, `app.company_id` set per transaction                                    | Done — 2026-09-28 |
| P2-M1.8  | Move existing admin checks (companies, invite codes, driver accounts, hazard delete) into application-layer policies                                  | Done — 2026-09-28 |
| P2-M1.9  | `apps/staff-bff`: verify staff tokens, proxy staff routes; remove the admin routes from driver-bff                                                    | Done — 2026-09-29 |
| P2-M1.10 | Dashboard: email + password + TOTP sign-in, point at staff-bff, "Users" screen (invite with presets, edit privileges, remove)                         | Done — 2026-09-29 |
| P2-M1.11 | Staff audit log (`companies.staff_audit`): who did what, to which company, when — written by every staff use case                                     | Done — 2026-09-29 |
| P2-M1.12 | Bootstrap + cutover: CLI to create the first platform account (README), migrate today's `is_admin` driver, drop `is_admin`, deploy                    | Proposed          |

### Notes per task

- **P2-M1.3** keeps staff accounts in the existing `companies` module rather than a new
  `organisations` one. It already owns the company aggregate, and a rename would be churn with
  nothing gained. Staff sessions copy identity's refresh-rotation + reuse-detection design. They
  don't share its tables, because identity's sessions belong to drivers.
- **P2-M1.4** TOTP is small, well specified, and testable against the RFC 6238 test vectors, so
  it's hand-rolled per decision 6 ("hand-roll small, well-understood things"). Recovery codes
  (hashed, single-use) come with enrolment, so a lost phone doesn't mean a support ticket.
- **P2-M1.6** is the change that makes a stolen driver token useless against staff routes. It
  needs a `kind` claim signed by core, not a header set by a BFF.
- **P2-M1.7** is the riskiest task and needs its own review:
  - Migrations keep running as the owner. Core runs as a new `wagonwise_app` role with plain
    grants (not the owner, not a superuser). That means a second `DATABASE_URL` in `config.ts`,
    `turbo.json`'s `passThroughEnv`, the README and the DO app spec.
  - Policies use `current_setting('app.company_id', true)`, set with `set_config(..., true)`
    inside the transaction. Platform staff get an explicit `app.platform_staff = 'on'` path,
    not a bypass role.
  - Testcontainers tests connect **as `wagonwise_app`** and try to read and write across two
    companies, and must be refused. A fixture test proves the policy is actually in force (the
    AGENTS.md "fail closed" rule): the same query as the owner sees both companies' rows.
  - In P2-M1, only the new staff tables are company-owned. `identity.drivers.company_id` stays
    as it is until P2-M2 replaces it with many-to-many driver links (agency drivers).
- **P2-M1.9** follows the design doc: a separate staff BFF, so driver-bff stops carrying admin
  routes (AGENTS.md rule 10). The doc puts the staff BFF in P2-M4. It moves here because staff
  auth needs somewhere to live, and the dashboard shouldn't keep going through the driver BFF.
- **P2-M1.12** needs a deploy plan: a new DO service for staff-bff, the new DB role, and the
  secrets. Remember the standing rule: never `doctl apps update --spec`.

## Notes from done tasks

- **P2-M1.2** (`companies/domain/staff-account.ts`, `staff-policy.ts`): pure functions, 24 tests.
  Two rules beyond the plan, both following from "managers only control what they hold":
  a manager can only switch _off_ privileges they hold too (not just switch on), and can only
  remove someone whose privileges they all hold. The last-manager guard applies to WagonWise
  admins as well: an admin fixing a company must promote someone before demoting its only
  manager. The domain keeps its own copy of the privilege list (rule 2);
  `interface/privileges-contract.test.ts` fails if it drifts from contracts.

- **P2-M1.3** (migration `0020_staff.sql`, `companies/infrastructure/postgres-staff-*.ts`): five
  tables. `staff_accounts` holds the account and its credentials (password hash, second-factor
  method, encrypted TOTP secret or phone), but the domain keeps them apart
  (`StaffAccount` vs `StaffCredentials`), so only sign-in code ever loads a hash or secret.
  Accounts are soft-deleted (`removed_at`) for the audit trail; one _live_ account per email,
  case-insensitive. `staff_challenges` covers both the sign-in second step and enrolment (an
  invitee's pending password and factor wait there until their first code proves the factor
  works, so no half-made account ever exists). `staff_recovery_codes` marks a code used in one
  statement, so the same code can't succeed twice. Database checks back up the domain rules
  (fleet users need a company; platform staff have no privileges; a TOTP account has a secret,
  an SMS account a phone). Repository tests: 15, run against a real Postgres 16 locally and in
  CI via Testcontainers.

- **P2-M1.4** (`companies/application/ports/` + `companies/infrastructure/`): building blocks,
  not yet wired into the running server (that, and its config, comes with the use cases in
  P2-M1.5).
  - `ScryptPasswordHasher`: node's scrypt, N=2^15, r=8, p=1, 16-byte salt; the parameters are
    stored in each hash so the cost can be raised later. Passwords are NFKC-normalised first.
    N is below OWASP's 2^17 baseline to keep a few simultaneous sign-ins inside a small
    container's memory; revisit if the container grows.
  - `AesGcmSecretBox`: AES-256-GCM, random IV, `v1:` prefix, for TOTP secrets. Needs a 32-byte
    key: a new `STAFF_SECRET_KEY` env var arrives with P2-M1.5. **Losing that key makes every
    authenticator enrolment unreadable** (staff would fall back to recovery codes), so it
    belongs in the deployment guide's secrets list, not just DO's env settings.
  - `Rfc6238Totp`: hand-rolled HMAC-SHA1, 6 digits, 30 s, one step of drift either way; checked
    against the RFC 6238 Appendix B vectors.
  - `CryptoRandomCodes`: 6-digit codes, `XXXXX-XXXXX` recovery codes (no 0/O/1/I/L), 256-bit
    invite tokens.
  - `IdentityCodeSender` over a new `IdentityModule.sendOneTimeCode`, so staff text/email codes
    use drivers' ClickSend/Resend setup without `companies` importing identity.

- **P2-M1.5** (`companies/application/`): the staff use cases, tested end to end against
  fakes (24 tests): invite, accept (password + chosen factor), confirm enrolment (creates the
  account, 10 recovery codes, signs in), sign in (password opens a challenge; the second factor
  or a recovery code gives tokens), refresh / sign out, set privileges, remove, list. Choices:
  - **Invite links aren't emailed yet**: creating one returns the token once for the inviter to
    send (as driver invite codes work today). Emailing needs a proper template; later.
  - **Staff sessions last 7 days of inactivity** (drivers: 60), then password + code again.
  - A wrong email and a wrong password give the same error, and an unknown email is checked
    against a well-formed decoy scrypt hash so both take the same time.
  - Challenges: 10 minutes, 5 tries. Recovery codes accepted in any case, with or without the
    dash, each once.
  - Removing someone signs them out everywhere; a removed account's refresh tokens stop working.
  - Not yet: rate limiting of password attempts per email/IP (only per-challenge tries), and
    wrapping multi-step writes in one transaction (arrives with P2-M1.7's per-request
    transaction). `StaffTokenIssuer` is a port with a fake until P2-M1.6.

- **P2-M1.6**: staff tokens, and core's staff routes wired into the running server.
  - Every access token now says what it is: `kind: 'driver'` or `kind: 'staff'` (same key, same
    15-minute life). Driver routes (core and driver-bff) refuse `kind: 'staff'`; staff routes
    refuse anything but `kind: 'staff'`. A driver token with no `kind` (issued before this
    change) is still accepted as a driver token; they all expire within 15 minutes of deploy.
  - Core serves `/staff/auth/{sign-in,second-factor,refresh,sign-out}`,
    `/staff/invites/{accept,confirm}` (no token needed), and `/staff/me`, `POST /staff/invites`,
    `GET /staff/members?companyId`, `PUT /staff/members/:id/privileges`,
    `DELETE /staff/members/:id` (staff token needed). Each request reloads the account, so a
    removed person is refused straight away even with an unexpired token.
  - `STAFF_SECRET_KEY` (base64, 32 bytes) is optional for now: without it a fresh key is made
    each boot, fine locally but it would lose authenticator enrolments on every deploy. It
    becomes required at P2-M1.12. Added to the README and deployment guide.
  - Still behind `X-Internal-Key`: nothing outside the VPC can reach these until the staff BFF
    (P2-M1.9).

- **P2-M1.7**: Row-Level Security, so the database itself keeps a company to its own rows.
  - Migration 0021 creates `wagonwise_app` (owns nothing, plain grants on every module schema,
    plus default privileges for future tables) and turns on RLS for `fleet.vehicles` and the
    five staff tables. Sessions, recovery codes and challenges have no `company_id`: a row is
    visible when its account (or, for an enrolment, its invite) is.
  - Three per-transaction settings, all empty unless set: `app.company_id`,
    `app.platform_staff` (WagonWise admins, every company, not a bypass role) and
    `app.staff_auth` (staff tables only, for the steps that have to find an account before its
    company is known: sign-in, second factor, refresh, accepting an invite, and loading the
    signed-in account on every request). No scope means no rows.
  - `DataScopes` (`shared/ports/data-scope.ts`, `platform/postgres-data-scopes.ts`): one
    transaction per scoped request, settings set with `set_config(..., true)` so they end at
    commit. Every Kysely instance is built on its pool, so repositories join the scope's
    transaction without changing. Committed when the work returns (an error `Result` included:
    a failed code attempt must still count), rolled back if it throws; the reply is sent only
    after commit. A Kysely transaction or a second scope inside a scope throws.
  - Staff routes: pre-sign-in routes in `staff-auth`, then each signed-in request loads the
    account in `staff-auth` and runs its work as `platform` or `company`. Fleet routes resolve
    the caller first, then run as `platform` (admins) or the caller's company. With RLS in force
    another company's vehicle is 404, not 403.
  - `APP_DATABASE_URL` (optional until P2-M1.12): core serves on it; `DATABASE_URL` stays the
    owner for migrations. Unset, core serves on `DATABASE_URL` as before and the owner skips
    RLS, so this deploys safely before the role has a password. Deployment steps in the
    deployment guide.
  - Proof: `composition/row-level-security.test.ts` connects as `wagonwise_app` through the real
    `PostgresDataScopes` and tries to read, change and plant rows across two companies, with
    the owner as the control, plus a guard that every table with a `company_id` has RLS except
    `identity.drivers` (P2-M2). Also run here against a local Postgres 16 with a
    non-superuser owner (as on DO): 10/10.
  - Known limits: a manager's invite only checks the email against their own company's
    accounts; the global uniqueness check runs again on accept and confirm (in `staff-auth`),
    so a clash is a clean 409 there. The sign-in transaction stays open while a text/email
    code is sent. `companies.companies` has no RLS (no secrets; company admin still runs as
    drivers until P2-M1.8/1.12).

- **P2-M1.8**: every existing admin check moved out of the routes into the use cases, so no
  caller of a use case (the staff BFF path at P2-M1.12 included) can skip it.
  - Each module owns its own policy function, per AGENTS.md rule 6: identity
    `application/authorization.ts` (`requireAdmin`: list drivers, update driver, create/list
    invite codes), companies `application/company-authorization.ts` (create/list companies, with
    a new `listCompanies` use case), hazards `application/authorization.ts` (delete, list all).
    Fleet's existing `canViewFleet`/`canManageFleet` are now called by its use cases, which take
    the resolved `Caller`.
  - Each returns a `Forbidden` error mapped to 403 in the module's one error table. Checks run
    before the target is looked up (update driver, delete hazard), so a non-admin can't tell
    whether an id exists.
  - Fleet: a vehicle in a company the caller can't see is `FleetVehicleNotFound` (404), the same
    as an unknown id; a same-company member without `manage_fleet` gets 403.
  - Behaviour change: a malformed request from a non-admin is now 400 rather than 403, because
    input is parsed before the use case runs. Neither reveals any data.
  - Tests: each use case gained refusal cases (non-admin, unknown caller, other company); the
    existing route tests' 403s pass unchanged, except the cross-company fleet PUT (now 404).

- **P2-M1.9** (`apps/staff-bff`, port 3003): the dashboard's staff back end.
  - It validates against the staff contracts, verifies staff tokens against core's JWKS
    (`kind: 'staff'` only, no legacy allowance, so a driver token is refused), and forwards to
    core's `/staff/*` with `X-Internal-Key`. It holds no business rules, and relays core's
    status and body unchanged.
  - Routes: the six pre-sign-in routes (no token), then `/staff/me`, `POST /staff/invites`,
    `GET /staff/members?companyId`, `PUT /staff/members/:id/privileges`,
    `DELETE /staff/members/:id`.
  - **Changed from the plan:** driver-bff keeps its admin routes for now. The dashboard's
    admin pages still sign in as drivers (decision 4: keep the current sign-in until after the
    roll-out), and core only takes driver tokens on those routes until the cutover. They move
    to staff-bff at P2-M1.12, when core's companies/fleet/hazards/drivers routes take a staff
    actor.
  - Not deployed yet: nothing calls it until the dashboard's staff sign-in (P2-M1.10). The DO
    service is part of P2-M1.12's deploy plan (the existing spec file is not applied; never
    `doctl apps update --spec`).
  - Still open: rate limiting of password attempts (only the per-challenge limit exists). A
    per-IP limit on `/staff/auth/*` belongs here or in core; decide with P2-M1.10.

- **P2-M1.10** (dashboard): staff sign-in, joining from an invite, and a Users screen, all
  against staff-bff (`VITE_STAFF_BFF_URL`).
  - **Alongside the driver sign-in, not replacing it** (decision 4): the staff session is its
    own store (`state/staff-auth-store.ts`) and area (`/staff/*`, `/join`), linked both ways.
    The fleet and admin pages still use the driver sign-in until the cutover (P2-M1.12).
  - The staff session lives in `sessionStorage` (ends with the tab; the refresh token lasts 7
    days). A 401 refreshes once and retries; a failed refresh ends the session. Signing out
    revokes the refresh token in core.
  - `/join?token=…`: password (12+ characters, typed twice), second factor (authenticator
    app, text or email; a UK mobile for text), the first code, then the 10 recovery codes shown
    once. For an authenticator app it shows the setup key and an `otpauth://` link; there's no
    QR code yet (it would need a QR library).
  - Users: managers see and manage their own company; WagonWise admins see everyone, filter by
    company id, and can invite WagonWise staff too. Presets (Manager, Dispatcher, Viewer) fill
    the ticks; privileges the signed-in person doesn't hold can't be ticked (core enforces it
    regardless). The invite link is shown once, to send by hand (invites aren't emailed yet).
    Someone without `manage_users` gets a plain "no permission" message.
  - Platform staff type a company id when inviting into a company: the company list lives
    behind the driver-token `/companies` route until P2-M1.12.
  - Checked in Chromium against the built dashboard with the staff BFF stubbed at the network
    level (the dashboard has no unit-test set-up): redirect when signed out, wrong password,
    sign-in with the code, token refresh and retry, invite with a preset, privilege change,
    sign-out revoking the session, the whole join flow (password rules, setup key, wrong code,
    recovery codes), and the no-permission message.
  - ~~Before staff sign-in goes live: rate-limit password attempts per email and per IP.~~
    Done in P2-M1.12a.

- **P2-M1.11**: the staff audit log (`companies.staff_audit`, migration 0022).
  - Recorded: `invite_created`, `staff_joined`, `signed_in` (method, or `recovery_code`),
    `sign_in_failed` (known accounts only: an unknown email has no company to file it under),
    `second_factor_failed`, `privileges_changed` (before and after), `staff_removed`. Routine
    reads and token refreshes aren't.
  - Written inside each use case, so it lands in the request's transaction: a change that
    commits always has its entry, a refused or rolled-back one never does.
  - Append-only: `wagonwise_app` can insert and read but not update or delete (revoked in 0022;
    0021's default privileges had granted them). Same RLS as the staff tables. No foreign keys to
    accounts, so the log outlives anyone it mentions.
  - Read with `GET /staff/audit?companyId` (core, forwarded by staff-bff): same visibility as the
    users list. The dashboard's Activity page shows the latest 200 in plain English, failed
    sign-ins highlighted.
  - The action list lives in the domain, the contracts and the migration's check constraint; a
    test keeps the first two equal (and names the third).
  - **Found and fixed while testing (a P2-M1.7 bug):** if a statement inside a `DataScopes`
    transaction failed and the code caught the error, Postgres had already aborted the
    transaction and turned the COMMIT into a silent ROLLBACK, so the request reported success
    with nothing saved. `PostgresDataScopes.run` now throws when the commit comes back as a
    rollback, and the RLS suite has a test for it.

- **P2-M1.12** is split into four PRs, each safe to deploy alone (agreed 2026-09-29): 12a
  sign-in guessing limits, 12b bootstrap the first WagonWise admin, 12c move the admin pages to
  staff sign-in (a clean switch: driver admins lose dashboard access when it lands, and are
  re-invited as staff), 12d make `STAFF_SECRET_KEY`/`APP_DATABASE_URL` required and deploy
  staff-bff.
- **P2-M1.12a** (done 2026-09-29): stopping password and code guessing.
  - Core, per account (`domain/staff-lockout.ts`): 5 wrong passwords or 10 wrong codes within
    15 minutes lock that account's sign-in (and a challenge already open) until the failures
    age out. Counted from the audit log's `sign_in_failed`/`second_factor_failed` entries, so
    there's no second counter; migration 0023 indexes the count. Answers `TooManyAttempts`
    (429), which does reveal the email has an account: the usual price of a lockout people
    can act on. Unknown emails never lock.
  - staff-bff, per address (`host/rate-limit.ts`): 30 tries per 15 minutes across sign-in,
    second factor and the two invite steps, 429 with `Retry-After`. In memory, per instance.
    Keyed on `request.ip`, so `TRUST_PROXY_HOPS` must match the proxies in front (1 on App
    Platform): too few and everyone shares the router's address; too many and callers can
    pick their own. A test shows a caller can't dodge it by adding their own address in front.
  - Dashboard: any 429 reads "Too many attempts. Please wait 15 minutes, then try again."

## Carrying over the interim scopes

- **P2-M1.2**: `can(actor, 'manage_fleet', companyId)` replaces `canManageFleet`. Keep
  `fleet/application/authorization.test.ts`'s cases as the regression suite; they must pass
  unchanged against the new policy.
- **P2-M1.12** (cutover), in addition to `is_admin`:
  - for every driver with non-empty `scopes` and a `companyId`, create a fleet-user invite for
    that company with the same privileges (the driver sets a password + TOTP on accepting);
  - then drop `identity.drivers.scopes`, remove `scopes` from contracts' `driverSchema` and
    `updateDriverRequestSchema`, and remove the dashboard's "any scope" sign-in path;
  - `fleet`'s `CallerDirectory` reads the staff actor instead of identity's driver record.
- Until then, every new privilege goes on the fixed list in **both** places
  (`DRIVER_SCOPES` in contracts and in identity's domain), not as a new mechanism.
- ~~Known gap: `PUT`/`DELETE /fleet/vehicles/:id` revealed whether a vehicle id exists.~~
  Fixed in P2-M1.8: another company's vehicle is now 404, the same as an unknown id.

## Decisions (user, 2026-09-28)

1. **Staff BFF now.** P2-M1.9 builds `apps/staff-bff`; the dashboard moves off driver-bff.
2. **Sign-in: email + password, then a second factor the person picks at enrolment**:
   authenticator app (TOTP), or a code by text or email. Behind a password, a texted or emailed
   code is a real second factor. The text/email codes reuse the ClickSend/Resend senders drivers
   already use: identity exposes a "send this code to this address" call on its facade, and
   `companies` reaches it through its own port (AGENTS.md rules 6-7), never by importing
   identity's adapters.
3. **The six privileges stand as listed.** Owner / Dispatcher / Viewer are presets in the invite
   form, stored as the resulting privilege list.
4. **Keep today's dashboard sign-in** (driver OTP + `isAdmin`/scopes) working until P2-M1.12's
   cutover, which happens after the roll-out.

**How managers and admins work (user's framing, same model):**

- A _manager_ is a fleet user holding `manage_users` (normally the Owner preset). They invite
  and manage people in their own company, can only grant privileges they hold themselves, and a
  company can never be left without a manager.
- _WagonWise admins_ are platform staff: they see everyone's privileges in every company and can
  change any of them, so WagonWise can step in for support. Every such change goes in the staff
  audit log (P2-M1.11) with the company it touched.
- Custom named groups per company ("Night desk") are possible later without changing this model.
