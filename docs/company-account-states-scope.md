# Company account states, then self-service sign-up (scope, 2026-11-22)

Owner's decision (2026-11-22): **build the blocking states first; open self-service sign-up only once they are in and the
owner confirms.** A firm that has not paid must be able to be paused, with the account kept and the data safe, before anyone
can create a firm without a person in the loop. This file is the plan for the states. Self-service sign-up is outlined at the end
and is **not to be built until the owner says**.

Nothing here is built yet. Where this says "today", it comes from `docs/modules.md` (Billing, Staff BFF) and a read of
`apps/core/src/host/staff-auth.ts` and `modules/companies`.

## Where things are today

- A firm is created by WagonWise staff on the dashboard's admin pages (`POST /staff/companies`, admin only). A `Company` is a name,
  a created date and a photo retention period (`modules/companies/domain/company.ts`). It has no status.
- Its first admin is invited by email (`/join?token=…`: a password, a second factor, recovery codes).
- What a firm may add is limited by **vehicle capacity** (`billing.capacity_changes`, effective-dated; none means 0). Fleet refuses a
  vehicle beyond it (`CapacityReached`) and jobs refuses a second live job on a vehicle.
- Invoices are drafted, issued and numbered in core and **paid by hand**; an issued invoice is frozen, a void one keeps its number.
- Every `/staff/*` request passes one hook, `host/staff-auth.ts` (`onRequest`), which sets `request.staffId` from a verified token.
  That is the single place a rule for all staff writes can sit. About 98 staff write routes exist, so a rule must not be added
  route by route.

## The states

A company has one of four states:

| State     | Meaning                                                                                | How it is entered                                                                  |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `trial`   | Free period, with a date it ends (`trial_ends_at`)                                     | Set when the firm is created (default three months, the owner can change per firm) |
| `active`  | Paying, or free by the owner's say-so (the pilot firm)                                 | The owner sets it; later, when payment is confirmed                                |
| `overdue` | Past the end of the trial, or an issued invoice past its due date; in the grace period | By date (see below), or the owner sets it                                          |
| `paused`  | Not usable while payment is outstanding; the account and data stay                     | The owner sets it; later, by date after the grace period                           |

Moves are recorded with who, when and why (an audit row, as the staff audit log already does for staff changes).

**Paused is read only, never locked out and never deleted.** What each state allows:

| Who and what                                                                    | trial / active | overdue            | paused                                                            |
| ------------------------------------------------------------------------------- | -------------- | ------------------ | ----------------------------------------------------------------- |
| Firm staff sign in, read every page, export their data                          | yes            | yes, with a banner | **yes**, with a banner and the way to pay                         |
| Firm staff create or change jobs, vehicles, drivers, maintenance, settings      | yes            | yes                | **no**                                                            |
| Walk-round check results, defect records, and the audit pack                    | yes            | yes                | **readable and exportable** (a firm must be able to produce them) |
| Invite staff, change privileges                                                 | yes            | yes                | no, except removing a person                                      |
| The firm's own billing page (plan, invoices)                                    | yes            | yes                | **yes**                                                           |
| Emails and notifications the firm triggers (job notices, maintenance reminders) | yes            | yes                | **stop**                                                          |
| Drivers: the free app, routing, hazards, SOS, their own trips                   | yes            | yes                | **yes, unchanged**                                                |
| Drivers: that firm's jobs, live position on the firm's jobs, hours sharing      | yes            | yes                | **off**; the app says the firm's account is paused                |
| WagonWise staff in the firm (platform staff)                                    | yes            | yes                | **yes**, never blocked                                            |

Two rules sit above the table: a paused firm's data is **never deleted** by the pause (the retention periods run as set), and a
driver in a cab never loses routing or SOS because of what their firm owes.

## How it is enforced

1. **Data**: a migration adds `status`, `trial_ends_at`, `overdue_since`, `paused_at` and `status_note` to the company (or to a
   `companies.account_state` table, to keep the company row small; to be decided when the code is read in detail), plus a log table
   for moves and for the emails sent.
2. **Staff writes**: in `host/staff-auth.ts`, after the token is verified, for a **fleet** staff member (not platform) and a method
   other than `GET`/`HEAD`, look up the firm's state (short cache, a few seconds, so a change takes effect almost at once) and answer
   `402`-style `{ error: 'account_paused' }` when it is paused. An allow-list of paths stays open: sign out, change own password,
   second-factor routes, own billing, removing a person. A test lists every staff write route and checks it is either blocked when
   paused or on the allow-list, so a new route cannot be added unguarded.
3. **Staff reads**: not blocked. The dashboard asks for the state with its first request and shows a banner.
4. **Drivers**: the jobs, notices and hours-sharing code that links a driver to a firm checks the state through a small port
   (companies exposes it; jobs and hours do not import companies' internals). Exact routes to be chosen by reading `jobs` and `hours`.
5. **Periodic task** (hourly, as the existing reminder tasks): the trial end and the overdue rules, below. The rules are pure
   functions of the dates, so they are unit tested with a fixed clock.

## Dates and emails

- **Trial end**: an email to the firm's admins 14 days and 7 days before `trial_ends_at`, saying the date and what happens
  (the price, how to pay, what pausing means). On the date the state becomes `overdue` and the grace period starts.
- **Grace period**: default **14 days** (owner to confirm). A reminder on the day and a week in. After it the state becomes
  `paused` and a final email says how to get it back.
- **Paying**: for now the owner sees the payment arrive and sets the firm `active` (or clears `overdue`) with one button; the firm
  is emailed that it is back. Once payments are collected by Direct Debit or card this becomes automatic.
- Every email is claimed in a log before it is sent (as `reminder_log` does for maintenance) so none goes twice, and a failed send is
  released so it retries.
- Until the periodic task is trusted, **automatic pausing is off** (a setting, default off): the task only emails and marks
  `overdue`; pausing is the owner's button. Switching automatic pausing on is a separate, deliberate step.

## What the owner sees

- The admin Companies page: each firm's state, trial end, and buttons to set the state (with a note), clear it, or extend a trial.
- A banner for firm staff: "Your free period ends on …", "Payment is overdue", "Your account is paused: you can see and export
  everything, but not change it. Contact support@wagon-wise.co.uk."
- The driver app: one line where the firm's jobs would be, when the firm is paused.

## Order of work (each its own PR against `main`)

1. **The state and the block.** Migration, the company state, the owner's buttons on the admin page, the staff write block with the
   all-routes test, and the driver-side switch-off. Existing firms are set `active` by the migration so nothing changes for them.
2. **Banners and emails.** The banner in the dashboard, the trial-ending and overdue emails with their log, and the firm's own
   billing page showing the date and what is owed.
3. **The periodic task.** Dates move a firm to `overdue`, and (once the owner switches it on) to `paused`.

Each PR ships with tests that run the real thing (the end-to-end tests under `composition/` show the pattern): a paused firm cannot
create a job or vehicle, can read and export, a driver still routes, and platform staff are not blocked.

## Open decisions for the owner

1. The grace period (14 days proposed) and the trial length (three months, per firm).
2. The exact read-only list above, especially whether a paused firm may still **export** everything (proposed: yes) and whether
   walk-round and defect records stay readable (proposed: yes, always).
3. Whether a driver of a paused firm sees anything at all of that firm (proposed: one line saying the firm's account is paused).
4. Whether a trial ends by itself on the date (proposed) or needs the owner to press a button.
5. Terms and the privacy notice: self-service sign-up needs both to link to (still open).

## Self-service sign-up (later; not to be built until the owner says)

Only after the states above are live and the owner confirms. Outline, so the states are designed with it in mind:

- A "Start free" form on `/for-hauliers/` beside "Ask for a demo": firm name, email, password, a terms checkbox. The email is proved
  with a code (as driver sign-up already does); no card at sign-up. The firm is made as `trial` for three months with a small vehicle
  limit (about 5), and the person becomes its first admin, then sets the second factor as an invited admin does today.
- A switch, off by default (`COMPANY_SELF_SIGN_UP`), so it can be turned off in a minute if it is abused.
- Limits: per address, per IP and per hour; a daily cap like the tester form's; a honeypot; every new firm raises an alert to the owner (email and the admin page).
- Payment details are asked for near the end of the trial (about day 60) through the provider's hosted page (Direct Debit first,
  then card), so card numbers never touch WagonWise. Needs a Stripe or GoCardless account, which the owner opens (the business bank
  account exists).
- Needs the terms and privacy notice done first (ICO registration was done by the owner on 2026-11-11, per `progress.md`).
