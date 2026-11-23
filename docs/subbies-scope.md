# Owner-drivers and "My subbies" (scope, 2026-11-23)

**Status: scope only. Nothing is built.** For the owner to read and decide on; the questions are at the end. Where this says
"today", it comes from a read of `modules/fleet`, `modules/jobs`, `modules/companies`, the migrations and the data scopes on
2026-11-23.

## Why

Two independent reviews of a load marketplace (2026-11-23, in chat) both said **not** to build an open marketplace now: most app
users are employed drivers who cannot legally take a third party's load; copying loads from Facebook or WhatsApp groups and load
boards breaks their terms, brings in UK GDPR and looks like double brokering; broking for a margin means a cash float and liability
for the goods. Both said to build the useful part inside the portal: a firm's **own trusted subcontractors**, with WagonWise as the
software and never a party to the deal.

The owner (2026-11-23): the portal was aimed at small hauliers (about 40% of the market), but owner-drivers are worth reaching, and
**an owner-driver will not sit at the portal setting up jobs**, so they make jobs from the app. Self-service sign-up and the referral
reward on the first paid bill are going ahead (`company-account-states-scope.md`, `modules.md` "Referrals").

## The idea in one paragraph

**An owner-driver is a one-lorry firm.** They have a company of their own on WagonWise, run from the app: their lorry, their
checks, their jobs (made in the app), what each job made. A haulier adds that firm to **My subbies** and offers it overflow work.
When the owner-driver accepts, **a job is made in their own firm**, linked to the haulier's job; as they drive it, the haulier's
job follows along (status, live position during the job, proof of delivery). WagonWise never holds money and is never party to
the deal.

How it grows: a haulier invites its subbies; each subbie gets a free firm that can receive work; the app offers them the rest of
their own firm's tools (£10 a month after the trial); a subbie can recommend WagonWise to a haulier they drive for (the referral reward, for firms of two lorries or more). Loads
only appear because hauliers bring them, so hauliers come first and owner-drivers follow.

## What today's code means

- **A driver can belong to several firms** (`fleet/domain/driver-link.ts`): one identity, links to many companies, the firm always
  approves.
- **Only office staff make jobs** (`jobs/application/authorization.ts`: `canDispatch` needs a staff caller with `dispatch`). A driver
  can only move a job assigned to them.
- **Driver and office accounts stay separate on purpose**, even for the same person (`companies/domain/staff-account.ts`). An
  owner-driver's right to make jobs from the app must come from their **driver link**, not from making the app a staff login.
- **Each firm's rows are fenced by Postgres** (migrations 0021, 0026, 0030): a request runs in one data scope (`company`,
  `platform`, `staff-auth` or `driver`, `platform/postgres-data-scopes.ts`), scopes cannot be nested, and `jobs.jobs` shows a row
  only to its own company or to the driver it is assigned to. A row belonging to two firms does not fit this.
- **A job's route comes from the vehicle the firm assigned, never from a profile the driver picked**
  (`jobs/application/get-navigation-profile.ts`), because a wrong height is a safety problem. A haulier does not know a subbie's
  lorry, so the vehicle on a subbie's job must be one the subbie's firm set up.
- **A job's vehicle must be the firm's own** (`assign-job.ts`) and the firm pays per vehicle (`billing.capacity_changes`).
- **A driver never sees the job's customer or price** (`Job.customer`, `Job.pricePence`, staff only).
- **Jobs already raise events** (`jobs/domain/events.ts`: created, assigned, status changed, completed, cancelled) through the outbox.
- **Billing is WagonWise's invoices to firms.** There is no firm-to-customer invoice.

## The design choice: one shared job, or two linked jobs

**A. One job, shared.** The haulier's job is assigned straight to the subbie's driver, with the subbie's lorry written onto the job.
Less to build at first, and a subbie needs no firm. But: the job sits in the haulier's firm only, so the subbie's own records,
costing and (later) invoicing never include it; the lorry on it is a typed-in copy, against the navigation rule; and every later
step (the subbie seeing their own history, their own check rules) fights the one-company fence.

**B. Two jobs, linked (recommended).** The haulier's job stays in the haulier's firm, marked "subcontracted to Dave Smith Haulage,
£360". Accepting makes a **new job in the subbie's firm**, assigned by the subbie (the owner) to themselves and their own fleet
vehicle. A new module links the two and copies progress from the subbie's job to the haulier's through events. Each firm's rows
stay its own, the navigation rule holds (the subbie's firm set up the vehicle), and costing works on both sides with no special
case: the haulier's job costs £360, the subbie's job earns £360.

B costs more (a module, event handlers, a narrow cross-firm read for the live map) and means every subbie has a firm. The second
is the point of the plan anyway, so **B is recommended**, and the rest of this file assumes it.

## Part A: owner-drivers make jobs in the app

### The permission

`fleet.driver_links` gains `role`: `driver` (today, the default) or `owner`. An owner may, from the app, for that company only:
create a job, assign it to themselves and one of the firm's vehicles, edit or cancel it before it starts, see its customer and
price, and answer subcontract offers (Part B). The role is set when the firm is made from the app, or by a firm's staff with
`manage_users` on the portal (a family firm where the boss drives); never by the driver.

### How a request runs

1. The driver BFF forwards `POST /jobs/mine` (and the edit, cancel and list routes) to core, as it forwards today's driver job
   routes. No rules in the BFF (AGENTS.md rule 10).
2. Core, in the **driver** scope: look up the caller's live `owner` link for the company named in the request, through a read-model
   port owned by jobs (`OwnerDirectory`, adapter in `jobs/infrastructure` over the fleet facade, rule 7). None: `Forbidden`.
3. Core, then in that **company** scope (a second, separate scope, not nested): the existing `createJob` and `assignJob` use cases,
   with a new actor `{ kind: 'owner_driver', driverId, companyId }` added to `JobActor`. `canDispatch` (and edit, cancel) allows it
   for its own company only. Create and assign are one transaction, so the job is never left as a draft nobody can see.
4. An audit row records it as done "by the driver, as owner", beside the staff audit log's rows.

The one-live-job-per-driver and per-vehicle rules, the stops rules and proof rules are unchanged, because the same use cases run.

### The screens (Jobs tab)

- **+ New job**, only for an owner. Three short steps, big targets, never on the active-trip screen:
  1. **Who for:** a customer, picked from earlier ones or typed once.
  2. **Where:** pick-up (optional) and delivery, with Plan route's place search; "Add a stop" for more.
  3. **When and what:** day and time, price (optional), photo and signature on delivery (remembered from the last job).
- **Same as last time** on a finished job: copies stops and customer; change the day.
- Then it is a normal job: Start opens the route cards, Arrived, Loaded, proof, signature.
- **Send proof** after delivery: the photo, signature, times and reference as a PDF through the phone's share sheet. WagonWise
  sends nothing itself.
- The Jobs tab of an owner lists the firm's upcoming jobs (from the company scope, after the owner check), not only the live one.

Later, not in the first version: a job from a pasted message (a parser behind a port, like `HazardParser`; never saved without the
driver confirming each field, the same rule as voice hazards); an invoice to the customer from a job (a new scope: today's billing
is WagonWise's own invoices).

### A firm from the app

More, **I run my own lorry**: the firm's name, optionally the Companies House and O-licence numbers, and the lorry already set up for
routing. That creates the company, a fleet vehicle from the routing profile (dimensions copied, then the firm's own), and an `owner`
link. No portal login; "Use the portal on a computer" sends the usual staff invite if they want one.

Making a company is admin-only today (`POST /staff/companies`). This is self-service sign-up by another door, so it waits for the
account states (`company-account-states-scope.md`) and the owner's go-ahead. Until then, WagonWise staff can make a one-lorry firm
and an owner link by hand, so Part A can be tried with real owner-drivers early.

## Part B: My subbies

### A new module: `subcontracting`

`apps/core/src/modules/subcontracting` (own schema, `api.ts` facade, the usual layers). It owns: the firm-to-firm **partner** links,
the subbie's **documents**, the **offers**, and the **link** between a haulier's job and a subbie's job. Jobs stays one-firm and knows
nothing of partners: it gains only a small `subcontract` note on a job (the partner's name and the price, its own types) and use
cases to mark a job subcontracted and to apply progress copied from elsewhere.

### Tables (sketch; migration numbers from 0099)

- `subcontracting.partners`: haulier company, subbie company (null until accepted), invited phone or email, status (`invited`,
  `active`, `ended`), the haulier's name for them, dates. One live link per pair.
- `subcontracting.documents`: belongs to the **subbie** company (uploaded once, seen by each haulier it partners): kind (O-licence,
  goods in transit, hire and reward, terms), number or insurer, limit, expiry, the file, uploaded by and when. A haulier can mark one
  "seen" (a row per haulier: who, when).
- `subcontracting.offers`: haulier job, partner, price (pence), answer-by time, status (`open`, `accepted`, `declined`, `expired`,
  `withdrawn`, `taken`), a **snapshot** of what the subbie may see (stops, windows, notes, proof and signature required), and the
  subbie's job once accepted. A partial unique index allows **one accepted offer per haulier job**, so Postgres decides who was first.
- `jobs.jobs` gains `subcontract_partner_name`, `subcontract_price_pence` and a `subcontracted` flag (jobs' own words; no partner id).

### Who sees what (row-level security)

- `partners`: both firms in the pair (`haulier_company_id = rls_company_id() or subbie_company_id = rls_company_id()`).
- `documents`: the subbie firm, and hauliers with an **active** partner link to it (a policy subquery on `partners`). An ended link
  hides them at once.
- `offers`: the haulier firm, and the subbie firm of the offer's partner.
- **The snapshot is why an offer can be shown before acceptance**: the subbie never reads the haulier's job row (which carries the
  customer and price); they read only the offer's frozen copy. Nothing widens `jobs.jobs`' policy.
- **The live map:** the haulier's map needs the subbie's positions during the job, which live in the subbie's firm. A narrow
  `security definer` function (the pattern 0028 uses for `fleet.company_for_code`), for example
  `subcontracting.partner_job_positions(haulier_job_id)`, returns positions only when the caller's company owns that haulier job, the
  link is active and the subbie's job is still running. Tested as the app role against real Postgres. The same for ETAs.

### The flow

1. **Invite.** On My subbies (`manage_fleet`), the haulier enters a phone or email. The person signs in to the app and sees the
   invitation; accepting asks them to pick their firm, or makes their one-lorry firm in two taps from their routing lorry (a firm
   that can receive work; see Money). They become its owner.
2. **Documents.** The subbie adds them in the app. The portal shows each with its expiry, warns both sides 30 days ahead (a daily
   task, like maintenance reminders), and greys out a subbie with anything expired: they cannot be offered work.
3. **Offer.** On a draft job, **Offer to subbies** beside Assign (`dispatch`): everyone, a group or one; the subcontract price; an
   answer-by time; first to accept, or "I'll pick". A push to each subbie firm's owners.
4. **Accept**, in the **subbie's company scope**, one transaction: claim the offer (the unique index refuses a second), create the
   subbie's job from the snapshot with the price and the haulier as customer, assign it to the owner and their chosen vehicle (the
   usual rules: free driver, free vehicle), and write `OfferAccepted` to the outbox. The subbie's job exists the moment they tap.
5. **The haulier's side catches up** (an outbox handler, idempotent through `outbox.handled`, rule 9): mark the haulier's job
   subcontracted (partner name, price), mark the other offers `taken`, tell the dispatcher. Seconds, not a page refresh.
6. **Progress.** Handlers on the subbie job's `JobStatusChanged`, `JobCompleted` and `JobCancelled` copy the status and timeline to
   the haulier's job; proof photos and signatures are **copied** into the haulier's job (each firm's retention then applies to its
   own copy). Positions are read through the function above, not copied.
7. **Cancelling.** The haulier cancels: the subbie's job is cancelled with a push saying so (one before it starts; a call is still
   needed once they are driving, and the app says so). The subbie cancels or fails it: the haulier's job goes back to draft with an
   alert, offers can go out again.
8. **The race:** the haulier cancels or edits the job in the seconds an offer is being accepted. The handler in step 5 finds the job
   no longer open and cancels the subbie's new job with a push. Editing a job with open offers withdraws them (a new offer goes out).

### What each side sees

- The haulier: the subbie firm's name, its documents (while partnered), the job's status, live position **only during that job**,
  and proof. Never the subbie's other jobs, trips, checks or hours (hours sharing goes to the job's own company, which is the
  subbie's: `hours.ts`, unchanged).
- The subbie: the stops, windows, notes and the subcontract price. Never the haulier's customer or customer price.

### What falls out for free

- **Navigation:** the subbie's job has the subbie's own fleet vehicle, so routing follows the existing rule.
- **Checks:** the subbie's firm's check rules apply to its own job.
- **Costing:** the haulier's job carries the subcontract price as its cost (one change in `costing/domain/job-costs.ts`: a
  subcontracted job costs its price, not wages and fuel shares); the subbie's job earns that price like any job.
- **Billing:** the subbie's lorry is the subbie's, never on the haulier's bill.

### Documents wording and checks

"Uploaded by the subcontractor." WagonWise never says vetted, checked or approved (the same rule as `fors-scope.md`). A solicitor reads
the wording before release. The O-licence number has a link to the public register beside it; an automatic check is to be found out.
How long documents are kept after a link ends: to decide with the privacy review.

## Part C: sharing between firms (much later)

Only once five or more firms are live and asking: a firm opts in to offering overflow to other WagonWise firms that opted in. Before
any firm offers beyond its own list it needs a checked Companies House number and O-licence. The open questions (a fee, liability,
payments) are in `phase-5-ideas.md` section 5 and are not reopened here.

## Money (the owner to decide)

- WagonWise never holds money between firms and is never party to a job. Firms invoice each other as now.
- **Receiving work is free.** A one-lorry firm made to accept a haulier's work can receive and drive offered jobs with no plan. Its
  own jobs (+ New job), checks, maintenance and costing are the trial, then £10 a lorry a month. This needs a "receiving" allowance:
  today a firm with no capacity can add no vehicle (`CapacityReached`), so one vehicle is allowed for receiving work only.
- **My subbies is part of the portal** for the haulier.
- **Referrals: unchanged (the owner, 2026-11-23).** The reward exists to get drivers to bring in the firm they drive for, so it stays
  for firms of two lorries or more, paid once the firm's first bill is paid (`modules.md`, "Referrals"). A subbie can still earn it
  by recommending a haulier they work for. A one-lorry firm earns no reward, whoever recommends it: one owner-driver bringing in
  another is £10 a month at most, not worth £25. No credit for a haulier whose invited subbies start paying. With self-service
  sign-up, one reward per Companies House number or payment card, so firms cannot be made up for gift cards.

## Safeguards

- A haulier reaches only firms it invited and that accepted. No list of WagonWise drivers or firms is ever shown.
- A self-signed-up firm can invite and offer only to its own list. Anything wider waits for Part C's checks.
- An offer shows the haulier's name and how long it has been on WagonWise, so a subbie can tell a new account from an old one.
- WagonWise never copies in jobs from Facebook, WhatsApp or load boards.
- Before release: the privacy notice, the DPIA and the store data forms (documents, the subcontract price, a second firm seeing a
  position during its job, copied proof).

## Stages, in order

Each stage is a few short sessions of one well-scoped task each, with tests alongside.

0. **Ask first (the owner, no code).** Phone the 18 firms messaged on 13 November: "How do you place overflow now? If you could send it
   to your own subbies from here, with their documents and proof of delivery, would that be worth paying for?" And a one-question card
   in the app, "Do you hold your own O-licence?", counted on the usage page, to know how many owner-drivers there are.
1. **The owner role and jobs from the app** (Part A). Slices: the `role` column and its domain rules; `OwnerDirectory` and the
   owner-driver actor in jobs; the two-scope route; the driver BFF routes and contracts (an owner's job response with customer and
   price, a driver's without); the + New job screens; Same as last time; Send proof. One-lorry firms made by WagonWise staff.
2. **The subcontracting module, partners and documents.** Migration and policies; invite and accept (making the receiving firm);
   document upload in the app; the My subbies page; expiry warnings. Useful on its own: it replaces the transport manager's
   spreadsheet of subbie insurance dates.
3. **Offers and linked jobs.** Offers and the snapshot; accept in one transaction; the outbox handlers (accepted, progress, proof,
   cancel); the positions function; costing's subcontracted cost; the portal's offer controls and the app's offer card.
4. **I run my own lorry** from the app, after the account states and self-service sign-up are live.
5. **Sharing between firms** (Part C), only on demand.

## Tests that matter most

- The role and the owner check: a `driver` link can never create a job; an owner only in their own company (pure domain, plus the
  two-scope route against real Postgres as the app role).
- **Visibility, in the contracts and at the database:** a non-owner driver's job response never has customer or price; an offer
  never carries the haulier's customer or price; a haulier reads no row of the subbie's firm except through the positions function,
  and the function returns nothing once the job ends or the link ends.
- **First accept wins:** two accepts at once, one job made, the other told "Taken".
- **Handlers are idempotent:** `OfferAccepted` and each progress event delivered twice change nothing the second time.
- **The race:** cancel during accept ends with both jobs cancelled and the subbie told.
- **Navigation:** a subbie's job routes with the subbie firm's vehicle, never a profile the driver picked.

## Questions for the owner

1. Two linked jobs (recommended) or one shared job? (The choice above.)
2. Stage 1 or stage 2 first? Stage 1 serves owner-drivers directly; stage 2 the hauliers who pay.
3. An owner sees their own jobs' customer and price in the app? (Suggested: yes, it is their firm.)
4. "Receiving work is free" for a one-lorry firm, and one vehicle allowed for it?
5. First to accept wins, or the haulier chooses, as the default?
6. How long subbie documents are kept after a link ends.
7. Is a solicitor available to read the documents wording before stage 2 ships?

## Not in this scope

Open load posting, any fee on a job, payments or payment links between firms, ratings of subbies or firms, copying loads from
outside WagonWise, abnormal loads, and a firm-to-customer invoice (its own scope).
