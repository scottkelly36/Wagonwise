# P2-M2 Driver links: joining a company

Scoped 2026-10-02 from the Phase 2 tech design doc §3 (`FleetDriver`, `DriverJoinedFleet`,
`DriverLeftFleet`, `VehicleAdded`) and the user's product direction below. **Status: planned, not
started.** The vehicles half of P2-M2 shipped early (PR #48, `fleet` module).

## Decisions (user's calls, 2026-10-02)

- **Drivers may already be using the app**, so joining a company has two ways in, and the company
  always has the final say:
  1. **Company invites a driver.** Staff with `manage_fleet` invite by phone or email from the
     dashboard. The driver sees a pending invitation in the app and accepts or declines.
  2. **Driver requests to join with a company code.** The driver enters the code in the app, which
     creates a request. Staff approve or reject it in the dashboard. The code alone never admits
     anyone.
- **A driver can be active with several companies at once** (agency drivers). The one-active-job
  rule (P2-M3) still applies across all of them.
- **One reusable join code per company**, shown to staff with `manage_fleet`, regenerated to revoke
  (a regenerated code stops the old one working at once). Attempts to guess codes are limited the
  same way staff sign-in is.

## Model

`DriverLink { companyId, driverId?, invitedIdentifier?, status, createdAt, decidedAt? }`, in the
`fleet` schema (`fleet.driver_links`), owned by the `fleet` module.

| Status      | Meaning                                         | Reached by                                 |
| ----------- | ----------------------------------------------- | ------------------------------------------ |
| `invited`   | Company asked; waiting on the driver            | staff invite                               |
| `requested` | Driver asked with the code; waiting on staff    | driver enters the code                     |
| `active`    | Driver works for the company                    | driver accepts an invite, or staff approve |
| `declined`  | Driver turned down an invite, or staff rejected | either side                                |
| `left`      | Ended after being active                        | driver leaves, or staff remove             |

- An invite is keyed on the **identifier** (phone or email), not on a driver account, so the
  dashboard can't be used to find out who already has a WagonWise account. The invitation shows up
  in the app for whoever signs in with that identifier, and `driverId` is filled when they accept.
- One live link per company and driver (a partial unique index on invited/requested/active).
  Declined and left rows stay as history.
- `company_codes` (`fleet.company_codes`): the current code per company, with the time it was
  made. **Stored as typed, not hashed** (changed from the first draft of this plan): staff have to
  read it out to drivers, and it admits nobody by itself since every request needs approval. A
  driver turns a typed code into a company through `fleet.company_for_code()`, a definer function
  that answers only for the exact code given, so a driver can't read anyone's codes.
- A new **`driver` data scope** (`app.driver_id` / `app.driver_identifier`) lets a driver see their
  own links and the invitations made for their identifier, and ask to join for themselves only.

## Plan

**Done so far: M2.1 (contracts), M2.2 (domain), M2.3 (migration 0028), M2.4 (use cases and
repositories), M2.5 (driver routes and proxy) and M2.6 (staff routes and the Drivers page),
2026-10-02.** The link state machine and the company-code rules are pure and tested; the
contracts are in `packages/contracts/src/fleet.ts`. Migration 0028 creates both tables with
row-level security, backfills an active link for every driver already assigned a company (tested
against pre-existing data), and leaves `drivers.company_id` for the cut-over.

| #       | Task                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-M2.1 | Contracts: link and code DTOs, invite / request / respond / approve / reject / leave requests.                                                                                        |
| P2-M2.2 | Domain: the link state machine (pure, exhaustively tested), code generation and normalisation.                                                                                        |
| P2-M2.3 | Migration: `fleet.driver_links` and `fleet.company_codes` with RLS and grants; copy each existing `identity.drivers.company_id` across as an `active` link.                           |
| P2-M2.4 | Use cases: invite, join with code, respond to an invitation, approve / reject, leave / remove, regenerate code, list. Events: `DriverJoinedFleet`, `DriverLeftFleet`, `VehicleAdded`. |
| P2-M2.5 | Driver side in core: list my invitations, join with a code, respond, leave, list my companies (driver auth). Code attempts rate-limited. `driver-bff` proxies them.                   |
| P2-M2.6 | ~~Staff routes and the dashboard **Drivers** page: invite, pending requests (approve / reject), active drivers (remove), the company code (show, regenerate).~~ Done.                   |
| P2-M2.7 | Driver app: "Join a company" (enter a code), invitations list, which companies I'm with, leave. JS-only, so it ships by `eas update`.                                                 |
| P2-M2.8 | Cut over: jobs' driver directory reads active links; the driver-accounts admin screen and `drivers.company_id` go; the RLS safety test loses its `identity.drivers` exception.        |

## Open items

- Driver app work (M2.7) is the first change to the app since the field-test builds; it needs a
  JS-only `eas update` and a check on a real device.
- Whether the old `drivers.company_id` is dropped in the same release as the cut-over (M2.8) or a
  release later. Leaning same release: only the admin screen and the jobs lookup use it.
- Emailing or texting invitations: invites appear in the app only at first, matching how staff
  invites work today (nothing is sent). A notification when someone is invited is a later addition.

## M2.4 notes

Use cases (all in the fleet module): invite a driver, join with a code, respond to an invitation, approve / decline / remove (company side), leave or withdraw (driver side), get and regenerate the company code, list links. Events written to the outbox: DriverJoinedFleet (on accept or approve) and DriverLeftFleet (by driver or by company). Postgres repositories write events without opening a transaction of their own, since the routes run inside a DataScopes transaction. **VehicleAdded is not raised yet**: nothing consumes it and it needs the vehicle repository to take events; it moves to whenever a consumer exists. No routes yet (M2.5 driver side, M2.6 staff side), and the code-guessing rate limit lives with the driver routes in M2.5.

## M2.5 notes

Driver routes in core (reachable only through driver-bff with a driver token; core's driver-auth now also gates /fleet/): GET /fleet/links (my links and invitations, with the company name), POST /fleet/links/join, POST /fleet/links/:id/respond, POST /fleet/links/:id/leave (also withdraws a pending request). Each runs in the new driver data scope. The driver's identifier comes from identity and company names from companies, both through fleet-owned ports supplied by composition. **Code guessing:** five wrong codes in 15 minutes blocks that driver (429) until the window passes; in memory per instance, which is enough for an 8-character code that admits nobody without approval. driver-bff proxies the four routes. Proven under real RLS by composition/driver-links-end-to-end.test.ts. The driver app screens are M2.7.

## M2.6 notes

Staff routes folded into `fleet/interface/routes.ts` alongside vehicles (same `registerFleetRoutes`, same `requireStaffId`/`callerAndScope`/`DataScopes` pattern): GET/POST `/staff/fleet/companies/:companyId/driver-links` (list, invite), POST `/staff/fleet/driver-links/:id/{approve,decline,remove}` (the link carries its own company, so no `companyId` in the path — same shape as the vehicle routes), GET `/staff/fleet/companies/:companyId/code` and its `/regenerate`. Listing needs only `canViewFleet`; everything else needs `manage_fleet` — both already enforced by M2.4's use cases, this just wires them up. A real `CodeGenerator` (`CryptoCompanyCodeGenerator`, Node's CSPRNG) was added since M2.4 only had a `FixedCodeGenerator` test double — `getCompanyCode`/`regenerateCompanyCode` had never been reachable until now. The DTO adds `driverIdentifier` (resolved per distinct driver id through the same `DriverIdentityDirectory` port M2.5 uses) so staff can see who a request or active link is for, since fleet has no driver name, only their sign-in identifier. `staff-bff`'s `dashboard-routes.ts` forwards the seven routes (it's an explicit allowlist, not a generic proxy — easy to miss). The dashboard's **Drivers** page (`pages/fleet/Drivers.tsx`, replacing its placeholder) mirrors Vehicle Profiles' company-picker pattern: join code (show/regenerate), an invite form, and three lists (pending requests with approve/reject, pending invitations with cancel, active drivers with remove). Proven under real RLS by extending `composition/driver-links-end-to-end.test.ts` with a staff flow (invite/approve/decline/remove/code, plus a cross-company 403/404 check) alongside route-level tests in `fleet/interface/routes.test.ts` and `staff-bff/dashboard-routes.test.ts`.
