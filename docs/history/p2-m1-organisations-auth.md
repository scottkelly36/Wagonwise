# P2-M1 Organisations, roles, RLS, staff auth + 2FA

Scoped 2026-09-28 from the [Phase 2 tech design doc](https://claude.ai/artifact/LK2oYrVSwotj7E8W9tXykD)
§4 and §9, plus its decision log's proposed 3-tier permission model. **Status: in progress. P2-M1.1
(contracts), P2-M1.2 (domain rules) and P2-M1.3 (storage) done 2026-09-28.**

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
| P2-M1.4  | Core: password hashing (`scrypt`, node crypto — no dependency), TOTP (RFC 6238, hand-rolled), and SMS/email codes via identity's facade, behind ports | Proposed          |
| P2-M1.5  | Core use cases: invite, accept invite (set password + enrol a second factor), sign in, refresh, revoke, set privileges, remove user                   | Proposed          |
| P2-M1.6  | Token claims gain `kind: 'driver' \| 'staff'`; driver routes reject staff tokens and vice versa                                                       | Proposed          |
| P2-M1.7  | **RLS**: non-owner `wagonwise_app` DB role, policies on company-owned tables, `app.company_id` set per transaction                                    | Proposed          |
| P2-M1.8  | Move existing admin checks (companies, invite codes, driver accounts, hazard delete) into application-layer policies                                  | Proposed          |
| P2-M1.9  | `apps/staff-bff`: verify staff tokens, proxy staff routes; remove the admin routes from driver-bff                                                    | Proposed          |
| P2-M1.10 | Dashboard: email + password + TOTP sign-in, point at staff-bff, "Users" screen (invite with presets, edit privileges, remove)                         | Proposed          |
| P2-M1.11 | Staff audit log (`companies.staff_audit`): who did what, to which company, when — written by every staff use case                                     | Proposed          |
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
- Known gap in the interim routes: `PUT`/`DELETE /fleet/vehicles/:id` answer 404 before the
  permission check, so a non-member can tell whether a vehicle id exists (ids are random UUIDs,
  low risk). Fix alongside P2-M1.8 by checking permission before revealing existence.

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
