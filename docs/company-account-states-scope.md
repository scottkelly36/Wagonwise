# Company account states, then self-service sign-up (scope, 2026-11-22)

Owner's decision (2026-11-22): **build the blocking states first; open self-service sign-up only once they are in and the
owner confirms.** A firm that has not paid must be able to be paused, with the account kept and the data safe, before anyone
can create a firm without a person in the loop. This file is the plan for the states, the tracking in the portal, the market-research
consent and the payment provider. Self-service sign-up is outlined at the end and is **not to be built until the owner says**.

Nothing here is built yet. Where this says "today", it comes from `docs/modules.md` (Billing, Staff BFF) and a read of
`apps/core/src/host/staff-auth.ts` and `modules/companies`.

## The owner's answers (2026-11-22)

- **Trial length:** three months now, to be cut to **one month** once a few firms have signed up. So it is a setting the owner can
  change (on the admin pages), applied to firms made after the change; a firm already on a trial keeps the date it was given.
- **Exports:** a paused firm **cannot export** its data. It can still see its pages. If it needs its records it asks WagonWise, who
  produce them (the audit pack and record exports are done by platform staff).
- **Drivers of a paused firm** see one line saying the firm's account is paused.
- **As automated as possible:** the trial end, the reminders, the pause and the un-pause on payment all happen without the owner
  pressing anything. The owner's buttons are for the exceptions (see "Automation and its safeguards").
- **Portal tracking:** the owner wants to see whether firms use the forms correctly and where the portal can be improved.
- **Market research:** an option, in the sign-up and the portal, that lets WagonWise contact a firm's staff to ask for feedback.
- **Payment provider:** the owner asked Stripe or GoCardless (answer below).

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

| State     | Meaning                                                             | How it is entered                                                               |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `trial`   | Free period, with a date it ends (`trial_ends_at`)                  | Set when the firm is created, from the trial-length setting (three months now)  |
| `active`  | Paying, or free by the owner's say-so (the pilot firm)              | Automatically when a payment method is on file at the trial's end, or the owner |
| `overdue` | Past the end of the trial, or a payment failed; in the grace period | Automatically by date or by a failed payment, or the owner                      |
| `paused`  | Not usable while payment is outstanding; the account and data stay  | Automatically after the grace period, or the owner                              |

Moves are recorded with who (a person, or "automatic"), when and why (an audit row, as the staff audit log already does).

**Paused is read only, never locked out and never deleted.** What each state allows:

| Who and what                                                                    | trial / active | overdue            | paused                                                                       |
| ------------------------------------------------------------------------------- | -------------- | ------------------ | ---------------------------------------------------------------------------- |
| Firm staff sign in and read every page                                          | yes            | yes, with a banner | **yes**, with a banner and the way to pay                                    |
| Firm staff **export** (CSV, PDF, the audit pack, any file download of records)  | yes            | yes                | **no**: "ask us and we will send it" (support@wagon-wise.co.uk)              |
| Firm staff create or change jobs, vehicles, drivers, maintenance, settings      | yes            | yes                | **no**                                                                       |
| Walk-round check results and defect records                                     | yes            | yes                | **readable** on the page, not exportable; WagonWise produces them on request |
| Invite staff, change privileges                                                 | yes            | yes                | no, except removing a person                                                 |
| The firm's own billing page (plan, invoices, the way to add payment details)    | yes            | yes                | **yes**                                                                      |
| Emails and notifications the firm triggers (job notices, maintenance reminders) | yes            | yes                | **stop**                                                                     |
| Drivers: the free app, routing, hazards, SOS, their own trips                   | yes            | yes                | **yes, unchanged**                                                           |
| Drivers: that firm's jobs, live position on the firm's jobs, hours sharing      | yes            | yes                | **off**; one line in the app: the firm's account is paused                   |
| WagonWise staff in the firm (platform staff)                                    | yes            | yes                | **yes**, never blocked                                                       |

Two rules sit above the table: a paused firm's data is **never deleted** by the pause (the retention periods run as set), and a
driver in a cab never loses routing or SOS because of what their firm owes. Because a firm cannot export while paused, WagonWise
must answer a request for its records promptly (the owner to set the time, for example two working days): a firm that cannot reach
walk-round records it must keep is a bad position for both sides.

## How it is enforced

1. **Data**: a migration adds `status`, `trial_ends_at`, `overdue_since`, `paused_at`, `status_note` and `hold` to the company (or to a
   `companies.account_state` table, to keep the company row small; to be decided when the code is read in detail), plus a log table
   for moves and for the emails sent. The trial-length setting is one row the owner edits.
2. **Staff writes**: in `host/staff-auth.ts`, after the token is verified, for a **fleet** staff member (not platform) and a method
   other than `GET`/`HEAD`, look up the firm's state (short cache, a few seconds, so a change takes effect almost at once) and answer
   `{ error: 'account_paused' }` when it is paused. An allow-list of paths stays open: sign out, change own password,
   second-factor routes, own billing, removing a person.
3. **Exports cannot be told from views on the server.** The dashboard builds its CSV, print and audit-pack files in the browser from the same
   reads the pages use, so the server cannot refuse a download without refusing the view. The rule "a paused firm cannot export" is
   done in the dashboard: the download and print buttons are hidden while the company is paused (a separate change, **not in the first
   build**). It is a nudge, not a security boundary: someone determined could still copy what they can see.
4. **Default deny, with a test.** Every request that is not a read is refused for a paused company unless it is on the short open list
   (removing a person, resolving an SOS alert), so a route added later is blocked without anyone remembering to. A test checks that each
   entry on the open list is a real route, and an end-to-end test on real Postgres shows a paused company refused, reads working, another
   company and WagonWise staff untouched.
5. **Staff reads**: not blocked. The dashboard asks for the state with its first request and shows a banner.
6. **Drivers**: the jobs, notices and hours-sharing code that links a driver to a firm checks the state through a small port
   (companies exposes it; jobs and hours do not import companies' internals). Exact routes to be chosen by reading `jobs` and `hours`.
7. **Periodic task** (hourly, as the existing reminder tasks): the trial end, the grace period and the pause, below. The rules are pure
   functions of the dates, so they are unit tested with a fixed clock.

## Automation and its safeguards

The owner wants as little by hand as possible. The loop, with no one pressing anything:

1. A firm is made (by the owner now, by itself later) as `trial` with its end date.
2. Emails 14 days and 7 days before the end say the date, the price and how to add payment details (a button to the provider's
   hosted page, once the provider is in; until then a way to tell WagonWise).
3. On the end date, a firm **with payment details on file** becomes `active` and billing starts; a firm without becomes `overdue`.
4. **Grace period** (default 14 days, a setting): a reminder on the day and a week in.
5. After it, the firm becomes `paused` and a last email says how to get back.
6. When payment details are added or an unpaid amount is paid, the firm becomes `active` again and is emailed. (Needs the provider's
   webhooks; until it is in, the owner clears it with one button.)

Safeguards, because an automatic pause can hurt a firm that did nothing wrong:

- A **hold** the owner can set on a firm ("never pause this firm", for the pilot firm and anyone being looked after by hand).
- **Every automatic move is emailed to the owner** and shown on the admin page, so a wrong pause is noticed the same day.
- A firm is only paused for **payment** reasons (no payment details at the end of the trial, or a failed payment that the provider has
  retried and still not collected), never for inactivity.
- The first release runs the loop with pausing as a setting that starts **on in a test environment and is switched on in production
  by the owner once**, after the dates have been seen to move correctly on a copy of real data. After that it stays on.

## What the owner sees

- The admin Companies page: each firm's state, trial end, hold, what moved it and when, and buttons to set the state (with a note),
  extend a trial, or set a hold. A setting for the trial length and the grace period.
- A banner for firm staff: "Your free period ends on …", "Payment is overdue", "Your account is paused: you can see your records but
  not change or export them. Add payment details here, or contact support@wagon-wise.co.uk."
- The driver app: one line where the firm's jobs would be, when the firm is paused.

## Portal tracking (to see whether the forms are used correctly)

The owner wants to see where firms struggle in the portal. It copies what is built for the driver app (`flow-tracking-plan.md`), so
the same rules hold:

- **First party only.** Events go to WagonWise's own core and database. No analytics service, no cookies, nothing added to the list of
  processors. A table `usage.portal_events`, written by core, read by platform staff on the usage page, kept **90 days** and swept.
- **Names, never content.** An event is a page or a form from a fixed list, and where it applies a **field name** and a **kind of
  problem** from fixed lists (`required`, `too_long`, `not_a_number`, `capacity_reached`, `not_allowed`). **Never a value anyone typed**:
  no registration, name, address, note or email. The lists are zod enums in `packages/contracts`, so anything else is refused.
- **What it answers:** which forms are opened and not sent (`form_opened` with no `form_sent` in the same session, counted when the
  page is left with the form touched), which fields cause the most errors, how long a form takes, which pages are used and which never
  are, where a new firm stops (add a vehicle, invite a driver, make a job).
- **Who it is about.** A random session id made in the browser when the portal opens, so one sitting can be followed, plus the
  **company** (not the person). The company is kept so the owner can see "this firm tried to add a vehicle three times and stopped"
  and ring them, which is the point for firms on a trial. The person's id is not stored. **Decision for the owner:** keep the company,
  or make it fully anonymous as the driver app is (proposed: keep the company, say so in the privacy notice).
- **Told in the privacy notice**, basis legitimate interests (improving the portal), with the same wording as the app's flow tracking.
  Check the ICO's current analytics guidance before release.
- **Shown** as a Portal section on the admin usage page: the forms with the most abandoned or failed sends, the fields behind the
  errors, and the firms that have signed up and not got as far as a first job.

This is its own PR, **not tied to the states**, and can go in before or beside them.

## Market research contact (an option, never a condition)

- A separate, **unticked** box at sign-up, and a switch on each person's profile in the portal: "WagonWise may contact me from time to
  time to ask for feedback, to help improve the system." It is **not** part of the terms checkbox and a firm can use WagonWise
  without it.
- Stored per person: yes or no, the date, and the version of the wording, so it can be shown what they agreed to. Withdrawn with one
  switch or a link in every research email. Nobody is contacted for research without it.
- Existing firms' staff are **not** emailed to ask; they see the switch on their profile and a one-time note in the portal.
- The wording in the terms, and how it sits beside the privacy notice, goes to the solicitor with the other terms questions (this file
  is not legal advice). Until then the switch is built and off for everyone.

## Taking payment: Stripe or GoCardless

Fees checked on 2026-11-22 from each company's pages and Stripe's own notice; **check the live pages before relying on them**.

|                                         | Stripe                                                      | GoCardless                             |
| --------------------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Direct Debit (Bacs)                     | 1%, at least 20p, capped at £4; £5 if a payment is disputed | 1% + 20p, capped at £4 (Standard plan) |
| Cards (UK, standard)                    | 1.5% + 20p                                                  | not offered                            |
| Hosted page to take the mandate or card | Yes (Checkout, in "setup" mode, so nothing is charged)      | Yes (hosted flow)                      |
| Tells us a payment failed or arrived    | Webhooks                                                    | Webhooks                               |

For £10 to £150 a month the two cost about the same on Direct Debit (a pound or so a payment). **Recommendation: Stripe.** One
account and one integration covers Direct Debit now and cards later (some firms will prefer a card), the hosted pages mean card
and bank details never touch WagonWise, and its webhooks drive the automation above. GoCardless is a Direct Debit specialist with good
handling of failed Direct Debits and is a fair choice if you only ever want Direct Debit; it would mean a second provider if cards
are wanted.

How it would fit: **core stays the record** of plans, vehicle capacity and invoices (already built). The provider holds the payment
method and collects the amount core says is due, then tells core it was paid or failed. WagonWise does not move to Stripe's own
subscription product, so capacity rules, the invoice numbers and the by-hand adjustments stay as they are. A separate piece of
work, after the states, and it needs a provider account that only the owner can open.

## Order of work (each its own PR against `main`)

1. **The state and the block** (built, PR 429). Migration, the company state, the owner's buttons and settings on the admin page, a basic
   banner, and the staff write block. Existing firms are set `active` by the migration so nothing changes for them; the owner sets the
   pilot firm's hold by hand.
   1b. **Drivers and downloads** (built, 2026-11-23). A paused company's jobs, live positions and hours sharing are switched off for its drivers, with
   one line in the app. **Downloads** (built, 2026-11-23): the dashboard's download and print buttons are replaced by a note while the company is paused.
2. **Banners and emails.** The banner in the dashboard, the trial-ending, overdue and paused emails with their log, the owner's
   alerts, and the firm's own billing page showing the date and what is owed.
3. **The periodic task.** Dates move a firm through `overdue` to `paused`, as the loop above, switched on by the owner once.
4. **Portal tracking.** Independent of 1 to 3; can go in beside them.
5. **Market research option.** The switch, the stored consent and the wording, off until the solicitor has seen it.
6. **Payment provider.** After the owner opens the account: hosted page for payment details, webhooks, firms moving to `active`
   and back from `paused` by themselves.
7. **Self-service sign-up** (below), only when the owner says.

Each PR ships with tests that run the real thing (the end-to-end tests under `composition/` show the pattern): a paused firm cannot
create a job or vehicle or export, can read, a driver still routes, and platform staff are not blocked.

## Open decisions for the owner

1. The grace period (14 days proposed).
2. How quickly WagonWise answers a paused firm's request for its records (proposed: two working days), since it cannot export itself.
3. Portal tracking: keep the company on each event (proposed) or make it fully anonymous.
4. Whether pausing starts on in production after one check on real data (proposed), or stays a button.
5. Stripe (recommended) or GoCardless, and opening the account.
6. Terms and the privacy notice, including the market research wording: self-service sign-up needs both to link to (still open).

## Self-service sign-up (later; not to be built until the owner says)

Only after the states above are live and the owner confirms. Outline, so the states are designed with it in mind:

- A "Start free" form on `/for-hauliers/` beside "Ask for a demo": firm name, email, password, a terms checkbox, and the separate
  unticked market-research box. The email is proved with a code (as driver sign-up already does); no card at sign-up. The firm is made
  as `trial` for the length in the setting, with a small vehicle limit (about 5), and the person becomes its first admin, then sets the
  second factor as an invited admin does today.
- A switch, off by default (`COMPANY_SELF_SIGN_UP`), so it can be turned off in a minute if it is abused.
- Limits: per address, per IP and per hour; a daily cap like the tester form's; a honeypot; every new firm raises an alert to the
  owner (email and the admin page).
- Payment details are asked for near the end of the trial (about 14 days before it ends, then the loop above) through the provider's
  hosted page, so card numbers never touch WagonWise.
- Needs the terms and privacy notice done first (ICO registration was done by the owner on 2026-11-11, per `progress.md`).
