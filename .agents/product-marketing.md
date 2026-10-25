# WagonWise: product marketing context

**Version:** 1.1 (draft) · **Updated:** 2026-10-25
**Sources:** `AGENTS.md`, `docs/progress.md`, `docs/phase-3-scope.md`, `docs/sales-playbook.md`,
`docs/play-store-listing.md`, `sites/landing/index.html`, and the owner's answers on 2026-10-25. Nothing here comes from a customer conversation yet.
**Convention:** `[confirm]` = my inference or a gap the owner must fill. Do not treat these as fact.

### Changelog

- 1.1 (2026-10-25): the owner corrected the record. There is **no pilot firm yet**. The portal is not worth selling until the
  app is in both stores. Founders terms set: free for 3 months, then £10 per vehicle for the first year. First firms will be a
  mix of known and unknown companies. Added section 15 (owner decisions) and rewrote the gaps list.
- 1.0 (2026-10-25): first draft, built from the repo only.

---

## 1. Product overview

**One line:** a free HGV navigation app for drivers, linked to a paid fleet portal for the haulage firm that employs them.

**Two products, one system, two different buyers:**

|                      | Driver app                                                                | Fleet portal (dashboard)                                                                                     |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Who uses it          | HGV drivers                                                               | Owner, transport manager, office staff                                                                       |
| Price                | Free, always                                                              | £15 per vehicle per month standard. Founders terms: free for the first 3 months, then £10 for the first year |
| Role in the business | Adoption engine, data source (hazard reports)                             | **The revenue**                                                                                              |
| Status               | Android built, in closed testing; not yet in Google Play or the App Store | Built (jobs, live map, checks, maintenance, job profit, reports, invoicing); no firm using it yet            |

**Driver app:** routes that fit the vehicle's height, width, length and weight; hazards reported by other drivers
(low bridges, tight bends) spoken as you approach; hands-free voice hazard reports; safe HGV parking with facilities; a
faster route _offered_ (never forced) when traffic builds; spoken turn-by-turn; driving-hours clock and break planning;
company jobs with proof-of-delivery photos; daily walk-round checks.

**Fleet portal:** send jobs and see them live on a map; proof of delivery; walk-round check results and defects inbox;
MOT / inspection / service dates with reminders; what each job cost and made, plus a look-ahead; reports and CSV export.
Nothing to fit in the lorry: it runs on the drivers' own phones.

**Stage (2026-10-25):** WagonWise Ltd (Hexham, Northumberland). A small group of driver testers; **no firm signed up yet**.
Phase 3 goal is _proof, not revenue_: 5 companies using it, 1 paying (aim 2).

**The portal depends on the app being in both stores.** A firm's drivers have to be able to install the app on their own
phones, on Android or iPhone, or the portal is empty. So the store release is the first marketing milestone, and no portal
campaign should start before it. Where that stands (from `progress.md`):

- **Google Play:** needs a closed test of about 12 testers opted in for 14 days in a row, then an application for production access.
  The Google account is personal, which is why the closed test is required. No known blocker to the application.
- **App Store:** the Apple Developer enrolment for WagonWise Ltd was submitted 2026-10-24 and is being processed (days, sometimes
  longer). After approval comes a first TestFlight build and then App Store review. Voice reports on iPhone are untested.
- Until both are live, the landing page's "Coming soon" badges are the honest message.

## 2. Target audience

**Primary (portal buyer):** small UK haulage firms, roughly 1 to 40 vehicles. The landing page already segments 1–5,
6–15, 16–40 and 40+. Strategy says: small firms first, **no big fleets until the end of Phase 4** (reached only via people the owner knows).
Starting geography: Northumberland / North East, because routing tiles cover only that area today (national coverage is built-ready but waits on a customer outside the region).

**Secondary (adoption engine):** HGV drivers, many in their 40s–50s, not tech-keen, rural roads, patchy signal. They are not the
payer, but if they like the app they bring the firm in, and the firm's jobs and checks run through their phones.

**Out of scope for now:** large fleets, Northern Ireland, abnormal-load operators (Phase 4), consumer or van drivers.

## 3. Personas

All hypotheses until tested in conversations with the first firms. `[confirm]` each.

- **Owner-operator / small firm owner (decision-maker and payer).** Runs 3 to 15 lorries, often also does the transport
  manager job. Time-poor, runs on phone, WhatsApp, paper and a spreadsheet. Cares about: bridge strikes, MOT / PMI dates not slipping,
  getting paid on time, proving deliveries, not buying kit. `[confirm]`
- **Transport manager / office (day-to-day portal user, influencer).** Chases drivers by phone, holds the compliance burden (checks,
  defects, maintenance). Wants one place and fewer calls. `[confirm]`
- **HGV driver (adoption champion, not the buyer).** Wants to avoid a wrong turn into a dead end or a low bridge, find a safe
  place to park, not be tracked in the background, and not type while moving. `[confirm]`
- **Blocker risk:** a driver who feels the app is for spying on him. The product answers this on purpose (location only while the app is open and only on a company job).

## 4. Problems and pain points

Product-implied problems, **not yet validated in the owner's customers' own words**:

1. Standard sat navs and car apps send HGVs down roads they cannot clear; bridge strikes are costly and dangerous.
2. Restriction data is incomplete; drivers know about hazards the maps do not (the driver-fed layer is the answer).
3. Jobs, checks and maintenance run on paper, WhatsApp and spreadsheets, so defects reach the office late and dates get missed.
4. The office doesn't know where a lorry is or whether a delivery was proven without phoning.
5. Firms don't know what a job actually made once fuel, wages and running costs are in.
6. Existing fleet systems (telematics, compliance suites) are priced and built for bigger firms and often need hardware.

**Most important test:** which _one_ of 3, 4 or 5 does a small haulier already feel? The sales playbook says to sell one problem at a time.

## 5. Competitive landscape

From the repo (`phase-3-scope.md`, `phase-5-ideas.md`) plus general market knowledge. **Unverified: run `competitor-profiling` before relying on it.**

- **Direct (HGV navigation):** Sygic Truck, TomTom GO Truck, Garmin dēzl, HERE WeGo truck mode `[confirm]`. Strong on routing; none (as far as I know) pairs a crowdsourced UK HGV hazard layer with a small-firm job and compliance portal.
- **Direct (small-firm compliance / transport software):** Convey, Tachogram, Tachomaster were reviewed by the owner on 2026-10-17 as comparisons for the compliance features. Detail not in the repo: `[confirm]`.
- **Secondary (telematics / fleet management):** Webfleet, Samsara, Microlise, Geotab. Powerful, hardware-based, aimed at larger fleets. Also potential integration partners (Track C) rather than only rivals.
- **Indirect (what most small firms use today):** paper walk-round sheets, WhatsApp, spreadsheets, a diary, Google Maps and phone calls. **This is the real competitor.**

## 6. Differentiation

1. **No hardware.** Runs on phones drivers already have, so a firm can start tomorrow with 2 or 3 vehicles.
2. **Free driver app, so adoption is bottom-up** and the firm pays only for the portal.
3. **Driver-fed hazard layer that can only make routes more cautious** (a hard safety rule in the product): the data advantage grows with use.
4. **One system for the jobs, checks, maintenance and profit** of a small fleet, priced per vehicle (£15, founders £10), with no big-fleet minimums.
5. **Built with and for drivers** and set up personally for each firm: the free first three months are a hands-on demo and tailoring period, so the product is shaped around each company's way of working. (Only say this about firms it is true for: the owner has to have the time.)
6. **Privacy by design:** no background tracking, anonymous hazard reports, firm-chosen retention, UK GDPR work done.

Do **not** claim: that it makes a firm compliant, that it replaces the tachograph, that parking shows live free spaces, or that voice works in every accent and cab (unproven).

## 7. Objections and anti-personas

**Likely objections** `[confirm in the first calls]`: "my drivers won't use it"; "I already have WhatsApp / a spreadsheet / a system"; "is this tracking my drivers (drivers' objection)"; "you're one person: what if you disappear?"; "is the hazard data reliable?"; "do I have to change how I work?"; "what about iPhone?" (iOS is not live yet).

**Anti-personas (not yet):** fleets of 40+ with an entrenched telematics suite; firms outside the North East needing national routing now; anyone wanting a tachograph-grade legal record or abnormal-load permits.

## 8. Switching dynamics

- **Push (away from today):** a near-miss or strike, a missed MOT or PMI, a late or disputed delivery, chasing drivers by phone.
- **Pull (to WagonWise):** free driver app, three free months with a hands-on demo and set-up, start with 2–3 vehicles, see jobs live, defects reach the office the same day. The founders rate is a real reason to move now.
- **Habit (stays put):** the existing paper / WhatsApp routine "works", drivers' routes in their heads.
- **Anxiety (fear of switching):** drivers resisting, learning curve, a one-person supplier, data and privacy, "another subscription".

## 9. Customer language

**No verbatim customer phrases yet.** The first conversations with firms are the way to get them: use the playbook's questions and write down exact words here.

Terms the product already uses with drivers and firms (UK English): _walk-round check, defect, proof of delivery, low bridge, hazard, safe parking, laybys, services, fleet, vehicle, haulier, transport manager, MOT, PMI, tachograph_.
Avoid: US terms (truck stop, trucker, dashboard-as-jargon), "AI", "telematics", "platform", "solution", and anything that sounds like surveillance.

## 10. Brand voice

Plain, practical, calm, UK English, respectful of experienced drivers; short sentences; honest about limits ("a planning aid, road signs come first", "tell us what is wrong with it"). Bridge heights in metres and feet/inches. No hype, no invented numbers, no promising unbuilt features. `[confirm with owner]` Product name is a working name: do not hard-code it into long-lived assets yet.

## 11. Proof points

Available now:

- A small group of driver testers (a driver is live). No firm yet, so no case study.
- Built and working: the full list in sections 1 and 6, shown on the landing page with example-data screenshots.
- Registered UK company (17530209); UK GDPR pack written, **solicitor review and ICO registration still pending**.

Missing (needed for marketing): a quote from a first firm (named or anonymous), one real before/after number (a defect caught, hours saved), driver testimonials, a bridge-strike or near-miss story, first paying customer.

## 12. Goals

- **Now:** 25 drivers (15 active), then 5 companies using it, then 1–2 paying (Phase 3 target; the owner expects £80–200 a month, "the point is proof").
- **Gate before any of this:** the app live in Google Play and the App Store (section 1).
- **Next:** 10 companies; Phase 4 ends ready for big fleets.
- **Weekly tally from the playbook:** messages sent, calls made, demos booked, demos given, trials started, trials paying.
  Record each firm's source (known contact or cold) so the two groups can be compared (section 15).
- Marketing goal: `[confirm]` realistic targets for the next 90 days.

## 13. Paid ads

Not used. `[confirm]` Budget is presumably tiny; this audience is small, local and reached better through people, trade bodies and word of mouth.

## 14. Learnings log

None yet. Entries go here as dated lines with evidence and status (active / watch / retired).

## 15. Owner decisions (2026-10-25)

- **Founders terms:** free for the first 3 months, then £10 per vehicle per month for the first year, then the standard £15.
  The free months are a demo and tailoring period: the owner shows the firm how to use it and shapes it to how they work.
  This settles the question the sales playbook left open (whether £10 is kept for good: it is not, it is a first-year rate).
  `[confirm]` whether "the first year" runs from signup or from the first paid month, and the standard price after it. Put it
  in writing to each firm before they start, as the playbook advises. The landing page still shows no price.
- **No pilot firm yet.** Earlier docs (`sales-playbook.md`, `phase-3-scope.md`) talk about "the pilot firm" as if one exists; treat that as the first firm to sign.
- **Store release comes first.** The portal is of no use to a company until its drivers can install the app from the stores.
- **First firms: a deliberate mix of companies the owner knows and companies they don't,** to learn what works with each.
  Treat it as an experiment: the same pitch to both, track source and outcome per firm, and compare. Warm contacts will say yes
  more readily and are poorer evidence that the message works; cold ones are slower but show whether the offer stands on its own.
  The playbook's rule for cold email to sole traders and partnerships (phone or LinkedIn first, no email without consent) still applies.

---

## Gaps to close before this is useful (in priority order)

1. **Get the app into both stores** (Play closed test then production access; Apple approval then TestFlight then review). This gates everything else for the portal.
2. **Who exactly pays**, and the biggest pain each early firm names (use the 7 questions in `sales-playbook.md` in the first conversations).
3. **What small firms use today** (paper / WhatsApp / a system) and which telematics, if any.
4. **Competitor detail:** who small firms compare you with.
5. **Where the first firms come from:** which known contacts, and how to find and reach unknown ones (trade associations, local operators, operator-licence data). `prospecting` can help once the stores are close.
6. **Proof:** nothing yet. The first firm's results are the first case study.
7. **Terms detail** from section 15.
