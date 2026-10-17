# Phase 5 scope (draft, 2026-10-17)

The list of what Phase 5 is meant to deliver, in one place. The research and reasoning behind most items is in
[`phase-5-ideas.md`](phase-5-ideas.md) (provider notes, the whiteboard, questions); this file is the plan: what, in what
order, what each needs, and how we will know it works. The order, sizes and "proof it works" are proposals for the owner to cut.
Nothing here is built unless the status says so.

## Where Phase 5 starts

Phase 4 ends with the product ready for big fleets (`phase-3-scope.md`, "Phase 4 on the board"). Phase 5 is what comes after the
first big fleets say yes: make it dependable as a business, fit into how big firms already work, go deeper on the driver's day,
and add the compliance and data features a fleet pays for. Some small items below are already built because testers asked early;
they are marked **Built**.

## Principles

- **WagonWise is "Lite": hardware-free (the owner, 2026-10-17).** It runs on the driver's own phone, so a small fleet starts in an
  afternoon with nothing to fit. A hardware option (vehicle units, tachograph download, tracking) is considered only **if Lite
  succeeds**; it is not in this phase. Say it plainly in the pitch: "Nothing to fit. It runs on the phones your drivers already have."
- **Driver-friendly first.** Drivers keep using the app when it helps them, and that is what keeps the shared data good (hazards,
  parking). Anything that watches drivers is built as facts the driver can see for themselves, not a score for the boss.
- **Ask about cost and return before any code; link before integrating** (the owner, 2026-10-13). For a booking, fuel or telematics
  provider: email first, start with a link, build a real integration only if it is free to connect and pays a commission or is
  clearly used.
- **One price per vehicle** (£10, target £15), the driver app free. No pay-per-module pricing unless firms ask.
- **Each module is proven with a real company before the next starts**, and each company chooses how long its data is kept.
- **Nothing outward-facing without the owner's go.**

## Modules

| #   | Module                         | What it delivers                                                                                                                               | Needs from the owner                                       | Proof it works                                                        | Size | Status                          |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- | ---- | ------------------------------- |
| P1  | Run it as a business           | Staging and production split; backups with a drilled restore; failure alerts and a status page; taking payment; support inbox; paperwork       | Business address, insurance, solicitor time, the bank      | A migration is tried on staging first; a restore has been done once   | L    | Not started                     |
| P2  | Compliance for Lite            | Documents with expiry dates; tachograph calibration as a maintenance item; an audit pack; a driver handbook with acknowledgements              | What the pilot firms keep on paper today                   | A firm gets an audit pack from the app without a spreadsheet          | M    | Not started                     |
| P3  | After-shift paperwork          | Fill in the paperwork a driver does after a shift from what the app already knows                                                              | **Which forms** (a father-in-law's case; see below)        | A driver's end-of-shift paperwork takes one tap and a check           | S-M  | **To be defined**               |
| P4  | Parking and fuel               | Corrections to parking spots; live "full" reports; partner parking; booking links; nearby diesel prices                                        | Provider answers (SNAP, TRAVIS), Fuel Finder portal access | Drivers use the corrections and fuel prices; bookings only if it pays | M-L  | Corrections **Built**, rest not |
| P5  | Fit a big fleet                | Single sign-on; depots and teams; bulk import and export; an API and webhooks; groups of companies; audit export                               | What the first big fleet asks for before signing           | A big firm onboards without WagonWise staff typing                    | L    | Not started                     |
| P6  | Staff portal, deeper           | The features firms ask for (a job board, customers and contacts, documents, reminders, exports); driver facts page; customer tracking link     | Watching a dispatcher for an hour; the tester question     | Fewer trips out of the portal to a spreadsheet                        | M-L  | Not started                     |
| P7  | Vehicle data                   | Telematics adapters (one provider first); tachograph source; fuel card feeds; maintenance text reminders                                       | Which telematics the first big fleet runs; partner prices  | Hours and position without the app open; a fuel feed matches a card   | L    | Not started                     |
| P8  | Routing further                | Live traffic in the engine; charges on the route; more vehicle detail (axles, ADR); delivery time windows; order several stops; wider coverage | Which customers drive where                                | The first route is right more often; the faster-route offer is rare   | L    | Not started                     |
| P9  | The driver app, further        | iOS; Android Auto and CarPlay; offline maps; other languages; automatic light and dark; an accessibility pass                                  | Apple account (needs the company), a decision on CarPlay   | A driver on iOS or in a cab-screen setup can use it day to day        | L    | Not started                     |
| P10 | The data other drivers rely on | Hazard trust scores; public sources (WebTRIS, roadworks, bridge strikes); moderation tools for volume; partner parking details                 | Nothing new                                                | One person keeps thousands of reports clean                           | M    | Not started                     |
| P11 | Share jobs with other hauliers | A firm sends a job to a set list of trusted hauliers; it flows into theirs. An open marketplace only if this shows demand                      | A solicitor's view; whether firms want it                  | Two firms hand a job over without a phone call                        | L    | Not started, last               |

## What is in each module

### P1. Run it as a business

- **Staging and production split.** A big firm should never be the test for a migration (deferred until now by choice).
- **Backups with a tested restore,** failure alerts by email and text, and uptime watched from outside; a status page.
- **Taking payment.** Invoices are issued and marked paid by hand today. Card or Direct Debit, VAT, and reminders for late payment.
- **Support.** A shared inbox, a response promise, an in-app "contact support", the staff guide kept current.
- **Paperwork.** Terms of service and terms of use, a DPA template customers can sign without a solicitor each time, ICO
  registration, insurance, rotated secrets before launch (`project-rotate-secrets-before-launch`).

### P2. Compliance for Lite (features only, own design)

A compliance system is a competitor's ground when it needs hardware; these are the parts a phone can do. Source:
`phase-5-ideas.md`, "Where WagonWise sits among other systems".

- **Documents with expiry dates** for drivers and vehicles (licence, CPC, ADR, calibration), with reminders in the portal and the
  morning email. The same shape as maintenance dates. Small.
- **Tachograph calibration as a maintenance item type.** A dated item like an MOT; may need no code. Tiny.
- **An audit pack:** one report of check history, defects and fixes, and maintenance, from data already held. Small to medium.
- **A driver handbook:** policies the driver reads in the app, with a record of who has acknowledged. Small.
- **A gentle summary of the driver's own hours,** for the driver, not a score for the boss. Small.
- **Licence checks against the DVLA, with consent.** Valued by operators, but needs an integration and consent handling. Documents
  first; this later.
- **Not now:** tachograph analysis, remote download, tracking units (the hardware option), DVSA Earned Recognition accreditation.

### P3. After-shift paperwork (to be defined)

A driver (the owner's father-in-law) has paperwork to fill in after a shift. We do not yet know which forms. What the app already
holds that could fill one in: the walk-round check and its defects, the trip and its distance and times, the hours clock, fuel,
the jobs and their proof of delivery, and breaks. **First step, no code:** ask him which forms they are (a photo of one is ideal),
who reads them, and what he writes on each. Then fill them from the app, with the driver checking before it is sent. Where a
form is the firm's own, it becomes a template the firm sets up in the portal.

### P4. Parking and fuel

- **Built (2026-10-17):** drivers suggest corrections to a parking spot (name, number of HGV spaces, what is there, a tip, or
  "closed or gone"); nothing changes until WagonWise staff approve it.
- **Live "full" reports.** Parking shows capacity, not free spaces. Starts as driver reports ("full"), not sensors.
- **Partner parking:** truck stops and depots confirming their own details (hours, price, spaces).
- **Booking.** Email SNAP, TRAVIS and Park Safe the five questions first (`phase-5-ideas.md`, ask 1); then show their sites with a
  "Book with …" link; build in-app booking only if it is free to connect and pays a return.
- **Fuel prices** near the driver or route from the GOV.UK Fuel Finder: a server-side job copies prices into core; the app shows
  the cheapest diesel; the portal's Fuel page compares what drivers paid with local prices. Check access, cost and licence first.

### P5. Fit a big fleet

Single sign-on (Microsoft and Google work accounts); privileges that apply to a depot or team, not the whole company; jobs,
drivers and vehicles from a spreadsheet, every page's data out as CSV; an API and webhooks so a transport management system can
create jobs and hear when they are delivered; several companies under one owner; an audit export and a retention page beyond photos.

### P6. Staff portal, deeper

The portal is thin and the right list comes from watching, not guessing (the owner, 2026-10-14). Find it by: sitting with a
dispatcher for an hour; reading the App usage page; asking each tester "What did you do outside WagonWise today that you wish it
did?"; the feedback inbox; and the guide's gaps. Candidates: a job calendar or board; customers and contacts as records;
documents per vehicle and driver; licence and CPC reminders; trailer records; a message to a driver from a job; scheduled
reports; per-depot views; a read-only customer link to track a delivery. **Driver scores** (on the board): start with simple facts
a driver can see for themselves (jobs done, checks done, defects reported), not one number; a score needs its own DPIA entry,
plain wording to drivers, and a rule that it is never the only reason for discipline. Safer-driving signals wait for telematics.

### P7. Vehicle data

Telematics: one adapter per provider behind a port in core (like the TomTom client), starting with the one the first big fleet
has; price it first (who pays for API access, and is it less than £10 a vehicle). Tachograph: the Bluetooth and server tracks are
outlined in `phase-3-scope.md` (Tracks B and C). Fuel card feeds instead of statement uploads. Maintenance text reminders (the one
part of Phase 3 M4 left over).

### P8. Routing further

Live traffic in the engine so the first route is already right; clean air and low emission zones, tolls and their cost in job
cost; axle weights, trailers and ADR; arrive-by times and a warning when the plan will miss one; ordering several stops for the
driver; Ireland or the near continent only if a customer drives there.

### P9. The driver app, further

iOS (blocked on the Apple account and company registration); Android Auto and CarPlay; offline maps; other languages, including
spoken directions (many drivers read Polish or Romanian better than English); automatic light and dark by sunrise and sunset; an
accessibility pass (large text, contrast, screen readers).

### P10. The data other drivers rely on

A trust score per hazard report, so one wrong report counts for less than five agreeing ones; clearer expiry; National Highways'
WebTRIS sensors, roadworks feeds and bridge strike data joined in; moderation tools so one person can keep thousands of reports
clean.

### P11. Share jobs with other hauliers

The smaller first step: a firm shares a job with a set list of trusted hauliers it already uses, and the job flows into the other
firm's WagonWise. It tests demand and the legal side (liability for the load, goods-in-transit insurance, operator licences, late
payment) without an open marketplace. Payment links and an open load board are only if firms ask; skip payments in the first
version. Needs a solicitor before design.

## Suggested order (to argue with)

1. **P1 first.** Nothing else matters if a big customer hits an outage with no one to tell.
2. **P2 and P3 next:** small, built from data already held, and they make Lite worth paying for. P3 waits on the forms.
3. **P5 and P6 driven by the first big fleet's asks.** Single sign-on and the API are the usual ones.
4. **P7 and P8 in the order the first fleets' vehicles and routes demand;** tachograph waits on the answer to "what do their
   tachographs have?".
5. **P4, P9 and P10 run alongside in small pieces,** because drivers feel them most and most need no sales conversation.
6. **P11 last.**

If the aim of Phase 5 is growing the number of firms, move P6 and P4 up; if it is going deeper with the first few, P2, P5 and P7.

## Open questions for the owner

1. Which of the big firms says yes first, and what do they ask for before signing?
2. Which forms does the father-in-law fill in after a shift, and can we see one?
3. Is Android Auto and CarPlay a must for big fleets, or a nice extra?
4. Do any customers drive outside Great Britain?
5. How should a large fleet be billed (invoice, Direct Debit, annual contract)?
6. Is the aim of Phase 5 to grow the number of firms or to go deeper with the first few?
7. Do firms want a score for drivers, or a list of events they can look at? (The second is simpler and safer.)
