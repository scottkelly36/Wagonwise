# WagonWise marketing plan

**Version:** 1.0 (draft) · **Written:** 2026-10-25 · **Horizon:** the next 90 days in detail, then 12 months in outline
**Built on:** `.agents/product-marketing.md` (v1.1), the framework in the `marketing-plan` skill from
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (scaled down: it is written for
funded teams, and this is a one-person company with no customers yet), and the repo's own docs.
**Convention:** `[confirm]` marks something I could not verify or that only the owner can decide. Nothing in this plan comes from a customer
conversation yet, so every conversion rate below is a hypothesis to test, not a forecast.

---

## 1. Executive summary

**The situation.** WagonWise is a free HGV driver app plus a paid fleet portal for small UK haulage firms. The portal is the revenue. There is no
paying customer and no firm using it yet. The portal is of little use until drivers can install the app from Google Play and the App Store,
and neither store listing is live.

**The strategy in one line.** Win the firm through its drivers: get the app into both stores, then sell the portal to small hauliers through
personal outreach, using a founding-firm offer to turn the first few into proof.

**Three bets**

1. **The stores are the first marketing job.** Nothing else converts until a driver can install the app. The Play closed test needs 12 testers for
   14 days, so recruit those testers from the drivers of firms you want to sell to. Each tester is a warm route to an employer.
2. **Sell by conversation, not advertising.** The buyer is a small, time-poor owner or transport manager. The plan relies on the owner's contacts,
   a target list of operators built from public data, and a short demo. Paid advertising is out.
3. **Run the first 20 conversations as an experiment.** Half known contacts, half strangers, one pitch, every step counted (as you decided). The
   point is to learn which segment and message work, and to collect the customer language the context document is missing.

**90-day priorities**

1. Get the legal and practical blockers cleared (ICO registration, consent wording, founding-offer rules).
2. Get through the Play closed test and the Apple approval, then launch in both stores.
3. Hold 10 listening conversations, then run outreach in two waves of 10.
4. Sign the first 2 to 3 founding firms and capture one real, approved result.

**12-month outcome to aim for (a hypothesis):** 10 firms on the dashboard, 3 to 5 of them paying, and one published case study. At an assumed
average of 8 vehicles per firm (unknown), 10 firms at £10 per vehicle is about £800 a month, and about £1,200 at the standard £15. This is a
proof-of-concept scale, as `docs/phase-3-scope.md` says, so the plan must cost almost nothing in cash. Time is the scarce resource.

---

## 2. Strategic frame

- **Positioning:** jobs, checks and maintenance in one place for small haulage firms, with no hardware and a free driver app. See the context
  document for the full positioning, personas and differentiation.
- **Who buys:** the owner or transport manager of a haulage firm with roughly 1 to 40 vehicles. **Who adopts:** the drivers. The firm pays
  only if its drivers use the app, so the app has to be good for the driver on its own.
- **Where it works:** Great Britain (England, Scotland and Wales). Northern Ireland is not covered. Start near Hexham because that is where the
  owner's contacts and hands-on set-up are practical, not because of a product limit.
- **Business model:** driver app free. Dashboard £15 per vehicle per month. Founding firms: 3 months free, then £10 per vehicle for the first year,
  then the standard price.
- **Market check (problem size × frequency):** the problems (late checks, missed dates, chasing drivers, not knowing job profit) occur daily or
  weekly in a small fleet, which is a strong frequency. Whether a small haulier feels them enough to pay £15 per vehicle is **unproven**, and the
  first 10 conversations exist to test exactly that. The plan treats it as the biggest open question.
- **Brand voice:** plain, practical, UK English, honest about limits. No claim that WagonWise makes a firm compliant, replaces the tachograph,
  or contacts the emergency services.

---

## 3. Current state

| Area                         | Score (0 to 5) | Evidence and gap                                                                                                                                |
| ---------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Product                      | 4              | Driver app and portal are built (jobs, live map, checks, maintenance, job profit, SOS, what3words). Real-phone testing still pending in places. |
| Distribution (stores)        | 1              | Android in closed testing, iOS waiting on Apple enrolment. Neither store listing is live.                                                       |
| Website                      | 3              | Fast, clear, honest. A page for haulage firms now exists with pricing. No analytics, so visits and sources are invisible.                       |
| Customer knowledge           | 0              | No firm yet and no recorded conversation.                                                                                                       |
| Proof                        | 0              | No testimonial, case study or number.                                                                                                           |
| Sales material               | 2              | A playbook exists (cold message, phone script, demo script). Untested.                                                                          |
| Pipeline                     | 0              | No target list yet.                                                                                                                             |
| Legal readiness for outreach | 1              | ICO registration, solicitor review and updated privacy notice and DPIA are still to do (`docs/progress.md`).                                    |
| Measurement                  | 1              | A weekly tally is planned in the playbook. No analytics or source tracking on the sign-up form.                                                 |

---

## 4. Acquisition

### 4.1 Stores first (the gate)

- **Google Play.** For personal accounts created after 13 November 2023, Google requires a closed test with at least 12 testers opted in for 14
  days before production access is allowed ([Google's help page](https://support.google.com/googleplay/android-developer/answer/14151465)).
  Blogs say the days must be continuous and that falling below 12 can restart the clock. Treat that as a risk and aim for 15 to 20 testers.
  **Recruit testers from drivers at target firms**, not friends, so each one is also a lead. One third-party guide says organisation accounts
  are exempt. The repo's Google account is personal and `docs/play-store-listing.md` judged switching not worthwhile. Given the 14-day wait, that
  is worth re-checking against Google's own wording `[confirm]`.
- **App Store.** Enrolment for WagonWise Ltd was submitted 2026-10-24. After approval: TestFlight build, then App Store review. Voice reports on
  iPhone are untested.
- **Ask every prospect what phones their drivers use.** The answer sizes how much iPhone matters, and it is free research.

### 4.2 Personal outreach (the main channel)

- **Warm and cold, as an experiment.** Same message to both. Record each firm's source and what happens at every step (section 9).
- **Target list from public data.** A register of goods vehicle operator licence holders in Great Britain is published as open data under the
  Open Government Licence and refreshed weekly ([data.gov.uk](https://www.data.gov.uk/dataset/traffic-commissioners-goods-and-public-service-vehicle-operator-licence-records)).
  I could not open the page from this environment, so which fields it holds (operator name, address, vehicles authorised) is **unverified**.
  Check the download, filter to small operators in the North East, Cumbria and the Scottish borders first, and then find contact names from
  each firm's own website or Companies House.
- **Rules for contact (a quick check, not legal advice; confirm against the ICO's current guidance).** You may generally email a limited company
  at a business address for business reasons. Sole traders and some partnerships are treated like individuals, so phone or post first and do not
  email without consent. Before any cold call, screen the number against the Telephone Preference Service and its corporate version. Always
  give an easy way to say no and keep a suppression list. `docs/sales-playbook.md` already covers email. The phone screening is the addition.
- **Playbook:** use the cold message, the 60-second phone script and the 20-minute demo in `docs/sales-playbook.md`. Change the wording as soon as
  real conversations show what lands. Use the `prospecting` and `cold-email` skills to draft lists and messages.

### 4.3 Events and trade bodies (research first, spend later)

- **RTX Scotland**, 18 to 19 November 2026, SEC Glasgow, free to attend (organiser listing found by search `[confirm]`). Go as a visitor to talk to
  small hauliers and listen. Do not exhibit.
- **Road Transport Expo and the Commercial Vehicle Show** are the UK's big annual road freight shows, in the summer and in April. The 2026 editions
  have passed and I could not confirm 2027 dates. Visit before considering a stand.
- **Trade bodies** such as Logistics UK and the Road Haulage Association run member communications and regional meetings. Ask what a small
  software supplier can do (a talk, a short article, a discount offer). Both are unverified ideas `[confirm]`.

### 4.4 Content and search (slow, start small)

The audit found one page targeting drivers and no content for buyers. Now that a firms page exists, add a few honest, useful guides, only after
keyword research (I have no search-volume data). Candidates: low bridge strikes and how drivers avoid them, safe overnight parking, and what a
walk-round check record should contain. Safety and compliance topics need accuracy checks against GOV.UK before publishing. Use the `seo-audit`,
`content-strategy` and `ai-seo` skills when ready. This is a **Later** item, not a first-90-days item.

### 4.5 Community and PR (once the stores are live)

- A Hexham start-up with an HGV app is a local story. Approach local press and trade titles at launch with a real angle (drivers sharing hazard
  reports) and a named spokesperson, and never overclaim.
- Driver Facebook groups reach drivers, not buyers. Join respectfully, follow each group's rules and ask admins before posting. Do not spam.

---

## 5. Activation

- **Firm activation:** the founding offer's three free months are an onboarding period. Success means: vehicles and drivers added, the first job
  sent and accepted on a phone, the first walk-round check done, maintenance dates entered. Define these four steps as the activation checklist
  and tick them per firm.
- **Driver activation:** install, sign in with the invite code, save the vehicle profile, complete one route or job.
- **Make setup low-effort:** the portal already has a spreadsheet import for maintenance dates, and the owner sets up the company. Keep onboarding
  to a short call and a checklist.
- **Know the iPhone share before onboarding:** a firm whose drivers are mostly on iPhone cannot start until the App Store listing is live.

---

## 6. Retention

- **Check-ins:** week 1, week 4, week 8 and week 11 (before the free period ends), each with one question: what is annoying you? The playbook calls
  this the most useful answer for what to build next.
- **Health signals per firm:** vehicles in use, jobs created per week, checks completed, last portal login.
- **Churn prevention:** a firm that has not created a job in two weeks gets a call, not an email.
- **Conversion moment:** at the end of month 3, show the firm what it has used and agree the £10 rate in writing.

---

## 7. Referral

- **Driver to employer** is the natural loop: a driver who likes the app mentions it to the office. Make it easy with a one-line message a driver
  can forward. A built-in "tell my firm" link would be a small product change `[confirm]`.
- **Firm to firm:** ask each happy founding firm for one introduction at month 2 to 3. Hauliers know each other.
- **Trade bodies and suppliers** (tyre, fuel-card and maintenance suppliers) talk to many small firms. Consider referral arrangements later.
- Use the `referrals` skill when there are customers to ask.

---

## 8. Revenue

- **Pricing is set.** £15 per vehicle per month standard, founding firms 3 months free then £10 for a year. Billing, plans and invoices are built (invoices are
  made and marked paid by hand, which is fine at this scale).
- **Decisions still open:** a cap on founding firms, the VAT position, the price after the founding year, and whether to offer annual billing.
  Put the agreed terms in writing before each firm starts (see section 12).
- **Avoid discounting beyond the founding terms.** The founding rate is the discount, so each extra concession weakens the standard price.
- **Illustration (assumptions, not forecasts):** at 8 vehicles a firm, the first paying firm brings £80 a month at £10 and £120 at £15.

---

## 9. Measurement

**The weekly tally** (from the playbook): messages sent, calls made, demos booked, demos given, trials started, trials paying. Add one column, **source**
(known or cold), so the two groups can be compared.

| Step       | Leading indicator                          | Starting hypothesis (to be replaced by real data) |
| ---------- | ------------------------------------------ | ------------------------------------------------- |
| Reach      | Firms contacted per week                   | 10 in the first outreach wave                     |
| Interest   | Replies or calls that become a booked demo | 2 or more demos from the first 10                 |
| Demo       | Demos given                                | 1 in 2 demos leads to a founding firm             |
| Activation | Firms completing the four-step checklist   | All founding firms within 4 weeks                 |
| Conversion | Firms agreeing the £10 rate after month 3  | Measured from month 4                             |

**Kill criteria (decide before you start):** if after 20 conversations fewer than 3 firms say they would pay, stop outreach and change the
segment or offer before sending more. If cold contacts convert at under half the rate of warm ones, treat the offer as not yet standing on its
own and focus on warm introductions.

**Website analytics:** the landing pages have no analytics, so visits and referral sources are invisible. A privacy-friendly, cookie-free tool
would help, but any added script needs the privacy notice updated first. The sign-up form also has no "how did you hear about us" field, which
would need a small backend change `[confirm]`.

---

## 10. Roadmap (gates, not dates)

The stores cannot be scheduled exactly, so the phases are gated.

**Phase 1: Unblock (weeks 1 to 4)**

- Register with the ICO, get the solicitor to review the privacy notice, DPA and DPIA, and update them for SOS and for demo requests (consent wording).
- Decide the founding-offer cap, VAT position and post-founding price.
- Start the Play closed test with drivers from target firms. Chase Apple enrolment.
- Build the target list (30 to 40 operators plus your warm contacts). Visit RTX Scotland.
- Fix the Overview screenshot and decide on analytics.

**Phase 2: Foundation (weeks 3 to 8)**

- Hold 10 listening conversations (use the playbook's seven questions). Do not pitch. Write down exact words and add them to the context document.
- Ask everyone what phones their drivers have and what telematics or tachographs they use.
- Prepare the demo company and a one-page leaflet. Draft the message variants.

**Gate 1: both stores live.** Then launch (announce to the sign-up list, the Facebook page, local press).

**Phase 3: Velocity (weeks 6 to 12, after Gate 1 if possible)**

- Two outreach waves of 10 firms, half warm and half cold. Demos on the 20-minute script. Offer a small start of 2 to 3 vehicles.
- Sign the first founding firms, set them up and start the check-in rhythm.

**Phase 4: Compound (week 10 onward)**

- Write the first case study with a firm's written approval. Ask for one introduction per happy firm.
- Start the first useful guide for search. Pitch trade press with a real result.

**Time budget (a recommendation):** your docs say you work in short sessions. Aim for about 4 to 5 hours a week on outreach and calls, and no
more than one meeting-heavy day a week.

---

## 11. Marketing operations (tools, by stage)

| Stage                    | Tool or skill                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Customer research        | `customer-research`, the playbook questions                                                         |
| Competitors              | `competitor-profiling` (the context document's competitor list is unverified)                       |
| Prospecting and outreach | `prospecting`, `cold-email`, `sales-enablement`, `pricing`                                          |
| Website and search       | `copywriting`, `cro`, `seo-audit`, `content-strategy`, `ai-seo`, `schema`                           |
| Launch                   | `launch`, `directory-submissions`, `public-relations`, `community-marketing`                        |
| Retention and referral   | `onboarding`, `churn-prevention`, `referrals`                                                       |
| Tracking                 | the weekly tally in a spreadsheet to start. Add analytics only after the privacy notice is updated. |

---

## 12. Open decisions (the owner's)

1. **Founding-offer cap** (how many firms), VAT wording, and the price after the founding year. Put the terms in writing before each firm starts.
2. **Consent wording** for demo requests, and the privacy notice and DPIA updates for demos and for SOS.
3. **ICO registration** and the solicitor review, which should come before any outreach email.
4. **Play account:** stay with the personal account and recruit 15 to 20 testers, or check whether an organisation account avoids the 14-day wait.
5. **Analytics and source tracking:** which tool, and whether to add a "how did you hear about us" field.
6. **Who the first 10 listening conversations are with,** and who is warm versus cold.
7. **Time per week** you can give to outreach.
8. **When to promote SOS.** It is built but not yet tested on a real phone. Do not market it until it has been, and always say it does not
   contact the emergency services.

---

## 13. Idea bank

| Idea                                                             | Stage               | When         | Notes                                               |
| ---------------------------------------------------------------- | ------------------- | ------------ | --------------------------------------------------- |
| Recruit Play testers from target firms' drivers                  | Acquisition         | **Now**      | Doubles as lead generation                          |
| Build target list from the operator register                     | Acquisition         | **Now**      | Check fields first. Sole-trader rules apply         |
| 10 listening conversations                                       | Research            | **Now**      | Fills customer language and proof gaps              |
| Visit RTX Scotland (free)                                        | Acquisition         | **Now**      | Research, not exhibiting                            |
| Warm-versus-cold outreach experiment                             | Acquisition         | **Now**      | Same message, tracked by source                     |
| Demo on example data, 2-to-3 vehicle start                       | Activation          | **Now**      | Playbook script                                     |
| Weekly tally with a source column                                | Measurement         | **Now**      | A spreadsheet is enough                             |
| Store launch announcement to the sign-up list                    | Launch              | After Gate 1 | Facebook page and local press too                   |
| Trade-body talks or short articles                               | Acquisition         | Later        | Explore Logistics UK and the RHA                    |
| Case study                                                       | Retention and proof | Later        | Only claims the firm approves                       |
| Forwardable "tell your firm" message                             | Referral            | Later        | In-app link is a product change                     |
| Helpful guides (bridge strikes, parking, check records)          | Content             | Later        | Keyword research and accuracy checks first          |
| Exhibit at a trade show                                          | Acquisition         | Q3 or later  | Only with paying firms and budget                   |
| Free tools or lead magnets (such as a walk-round check template) | Acquisition         | Later        | Accuracy and the "does not make you compliant" line |
| Webinars                                                         | Acquisition         | Skip for now | Audience is small and hands-on                      |
| Paid search or social ads                                        | Acquisition         | Skip         | Tiny audience, no budget, no proof                  |
| Influencer or creator partnerships                               | Acquisition         | Skip         | Poor fit for this buyer                             |
| Cold SMS or WhatsApp                                             | Acquisition         | Skip         | Higher legal risk, low fit                          |
| Broad social posting                                             | Brand               | Skip         | Time better spent on conversations                  |

---

_Sources found by search while writing this plan: [Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465),
[data.gov.uk operator licence records](https://www.data.gov.uk/dataset/traffic-commissioners-goods-and-public-service-vehicle-operator-licence-records),
and listings for [RTX Scotland 2026](https://www.showsbee.com/fairs/57343-RTX-Scotland-2026.html). Third-party pages are secondary sources: verify before you rely on them._
