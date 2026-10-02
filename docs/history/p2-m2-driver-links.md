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
- `company_codes` (`fleet.company_codes`): the current code per company, stored hashed, with the
  time it was made.

## Plan

**Done so far: M2.1 (contracts) and M2.2 (domain), 2026-10-02.** The link state machine and the
company-code rules are pure and tested; the contracts are in `packages/contracts/src/fleet.ts`.

| #       | Task                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-M2.1 | Contracts: link and code DTOs, invite / request / respond / approve / reject / leave requests.                                                                                        |
| P2-M2.2 | Domain: the link state machine (pure, exhaustively tested), code generation and normalisation.                                                                                        |
| P2-M2.3 | Migration: `fleet.driver_links` and `fleet.company_codes` with RLS and grants; copy each existing `identity.drivers.company_id` across as an `active` link.                           |
| P2-M2.4 | Use cases: invite, join with code, respond to an invitation, approve / reject, leave / remove, regenerate code, list. Events: `DriverJoinedFleet`, `DriverLeftFleet`, `VehicleAdded`. |
| P2-M2.5 | Driver side in core: list my invitations, join with a code, respond, leave, list my companies (driver auth). Code attempts rate-limited. `driver-bff` proxies them.                   |
| P2-M2.6 | Staff routes and the dashboard **Drivers** page: invite, pending requests (approve / reject), active drivers (remove), the company code (show, regenerate).                           |
| P2-M2.7 | Driver app: "Join a company" (enter a code), invitations list, which companies I'm with, leave. JS-only, so it ships by `eas update`.                                                 |
| P2-M2.8 | Cut over: jobs' driver directory reads active links; the driver-accounts admin screen and `drivers.company_id` go; the RLS safety test loses its `identity.drivers` exception.        |

## Open items

- Driver app work (M2.7) is the first change to the app since the field-test builds; it needs a
  JS-only `eas update` and a check on a real device.
- Whether the old `drivers.company_id` is dropped in the same release as the cut-over (M2.8) or a
  release later. Leaning same release: only the admin screen and the jobs lookup use it.
- Emailing or texting invitations: invites appear in the app only at first, matching how staff
  invites work today (nothing is sent). A notification when someone is invited is a later addition.
