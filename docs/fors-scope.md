# FORS accreditation: helping a transport manager keep the evidence

Scoped 2026-11-10 (docs only, nothing built) from the owner's question after reading a transport manager's post in a Facebook group: a Bronze
accredited firm with two drivers newly on tachographs asking "is there anything else we should add?" for their next audit. The idea is that
the portal's likeliest daily user is a transport manager, many of them are accredited or want to be, and the portal could hold the records an
audit asks for and show what is missing. **What the portal must never do is say a firm is compliant or will pass** (the same rule as the audit
pack and the driving-hours clock).

## What FORS is, and what was read (2026-11-10)

The Fleet Operator Recognition Scheme: Bronze, Silver and Gold, audited against the **FORS Standard**. Read for this note: **Version 7.0, May
2024** ([PDF](https://www.fors-online.org.uk/cms/wp-content/uploads/2024/05/FORS_Standard_v7_May_2024.pdf)), and FORS's page for
[small fleet operators](https://www.fors-online.org.uk/cms/information-for-small-fleet-operators/) (fewer than five vehicles and fewer than five
employees; policy can be spoken, but records must be shown). **Not read:** v7.1 (November 2024) and a 2026 Bronze evidence checklist both exist
(their pages would not load); and FORS's own audit question set is the real test. **Before building anything, read the version a customer is
actually audited against** and re-check every requirement below.

**The post's "M3" is not drivers' hours.** In v7.0, M3 is **Responsible person** (an appointed, trained person; for an operator licence holder,
the transport manager's qualifications and FORS Professional Development). Drivers' hours is **D7 Working time and drivers' hours**, with the
tachograph and infringement duties spread over **M10, M2, D1 and V1**. The poster probably used an older numbering; either way the answer is in
those five.

## The poster's list against the standard

The poster has a tacho policy, working time records, a third party doing downloads, an infringement policy, signed written responses, a
warning procedure, and the driver keeps the read-out. That covers most of D7 and M10. What D7 and M10 also ask for, that the post does not
mention (the answer the poster wanted, and a checklist the portal could hold):

- **D7:** the **frequency of downloading** vehicle unit and driver card data, written down; the recording method for each driver (digital,
  analogue, logbook); **monitoring both driver and company tachograph card expiry dates**; what happens with a **lost or defective card**;
  **missing mileage and unknown event reports**; **secondary employment** and its effect on hours; planning schedules and rest to limit
  fatigue; managing **long journeys and night driving**; the duty to **report fatigue**; commuting, no fixed base, overnight stays where they
  apply. A firm with some drivers on domestic rules (logbooks) and some on tachographs needs the procedure to say which rule each follows.
- **M10:** a **competent person** investigates each infringement for the **direct and root cause**, whether a **control measure failed**,
  records the **corrective action**, and **reviews whether it worked**. The list is wider than hours: moving traffic offences, fixed penalty and
  penalty charge notices, roadworthiness prohibitions, notices of intended prosecution, public inquiry outcomes, and **road user charges, clean
  air and low emission zones, tolls and permit schemes**.
- **M2:** keep **drivers' hours records 12 months and working time records 24 months**; vehicle tests 15 months after expiry; defect and
  maintenance records 15 months; everything else until the next audit. Retrievable, legible, in a form an auditor can open.
- **D1:** driving licence checks **at least every three months** (monthly for six or more points), through a service that reads DVLA data;
  includes **digital tachograph driver cards** and **Driver CPC (DQC)**; and a **signed annual declaration** from each driver to report
  endorsements and infringements, on or off duty.
- **V1:** **calibration tests** and **speed limiters** sit in the inspection and maintenance plan: 15 months of history and a rolling six months
  forward. (FORS small-operator page: calibration documents shown at audit.)

Small-operator evidence, from FORS's page: a selection of drivers' hours records from the last 12 months, working time records from 24, driver
infringements and missing mileage investigations where they apply.

## What the portal already has (checked in the code, 2026-11-10)

| FORS                        | In WagonWise today                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V2** daily walkaround     | Built: lists, drivers' checks with photos, defects with a status trail, a rule to hold back a "do not drive" vehicle.                                                                                    |
| **V1** maintenance plan     | Mostly: due dates by vehicle with reminders, MOT and tax lookup, repairs, 15-month retention for defects. Needs a **calibration** item type (listed as a starter item) and a **six-month forward** view. |
| **Audit pack**              | Built for one vehicle (checks, defects, repairs, maintenance with every date change). Not company-wide, and nothing from D1, D7 or M10 in it.                                                            |
| **O1** routing              | Core strength: routes for the vehicle's real size, restrictions, hazards. O1 also wants **fleet distances recorded by vehicle type**: jobs hold routes, so a report is likely small.                     |
| **M2** retention            | Partly: checks have a firm-chosen retention with a 15-month floor for defects. Nothing for hours or working time records.                                                                                |
| **D7** hours                | Only the driver's own clock and sharing status. **No tachograph data, no download log, no card expiry.**                                                                                                 |
| **D1, M3, M10, M1, M5, D4** | **Nothing.** No licence or card records, no infringement log, no policies library, no acknowledgements, no training records.                                                                             |

## The design: a place for the records and a plain gap list, never a verdict

Same lessons as the hills and charges work: build on data already held, small steps, wording that never claims compliance, and **do not
fetch or hold what the firm's own systems already hold** (no tachograph files in the first versions; WagonWise stays hardware-free).

1. **Documents with expiry dates** (already scoped as "M9 compliance for Lite", `phase-3-scope.md`): per driver (licence, CPC/DQC, **tachograph
   driver card**, ADR) and per vehicle (insurance, calibration, operator licence, plated weights), a company tachograph card, with reminders
   through the existing Maintenance reminder path (email, text, portal). Covers D1, D7 card expiry, V1 calibration, M7 expiry. Optional file
   upload; a date alone is a start.
2. **An infringement log** (M10, D7): record a notice or hours infringement (type from M10's own list, date, driver, vehicle, reference,
   cost), then **investigation** (who, root cause, whether a control measure failed), **corrective action** (the set M10 lists: procedure
   change, retraining, development, disciplinary), **driver's written response with an acknowledgement**, an **effectiveness review date**
   that comes round as a reminder, and a status trail like defects have. Charges from the charges work (a Dartford or clean-air notice)
   belong here as a type. This is the gap the poster's own process fills with paper.
3. **A tachograph and hours records tracker** (D7, M2): per vehicle unit and driver card, **when it was last downloaded and when it is next
   due**, who analysed it and when, **missing mileage and unknown events** logged and closed, the driver's recording method. A date and a
   sign-off, not the data: the third party that downloads stays the source. The legal gaps between downloads for vehicle units and driver
   cards must be **checked on GOV.UK before they are put in the app** (not verified here). Retention: 12 months for hours records, 24 for
   working time, once files are held.
4. **A policies library with review dates and acknowledgements** (M1, M5, D3): the firm's policies (tachograph, infringements, working
   time, walkaround, routing), a review date each (M1 asks for review), and a record that each driver has read the current version in the
   driver app (the "driver handbook with who has acknowledged it" idea already listed). WagonWise could offer **starter wording**; it must
   be plain "an example, edit it", never a claim it meets FORS.
5. **Responsible person and training** (M3, D4): the appointed person, their qualifications, a training record per driver.
6. **A company-wide evidence pack** (extends the audit pack): one report for a period with the records above, as the audit pack does for a
   vehicle, plus the gaps: "no download recorded for this unit in N days", "card expires in 12 days", "two infringements have no review
   date". The gap list says **what is not recorded**, not that the firm fails or passes.

What it will not do: **know the firm's audit result**, judge whether a procedure is adequate, read tachograph files (stage 3 holds dates, not
data), check licences against DVLA (the Access to Driver Data route is parked: needs DVLA approval and the driver's consent), or replace
the FORS audit. Silver and Gold (performance data, road risk, environment, decarbonisation) are mostly outside this and not scoped.

## Stages (smallest first)

1. **Documents with expiry** (item 1). Reuses the Maintenance reminder machinery; the most-asked-for thing in the earlier research.
2. **Infringement log** (item 2). The biggest gap and the clearest match with the post.
3. **Tachograph and hours tracker** (item 3).
4. **Policies and acknowledgements** (item 4) and the **responsible person and training** records (item 5).
5. **The company evidence pack with the gap list** (item 6), once there is something to put in it.

## Decided (owner, 2026-11-10)

Nothing yet: this is research and a proposal.

## Open decisions (owner)

- **Is this the next focus**, or after the charges work, hills tuning and the sales notebook? Stage 1 is the cheapest and helps every firm, FORS or not.
- **Talk to transport managers first.** The father-in-law's firm and the sales contacts could say, in ten minutes each, what their last audit
  actually asked for, which evidence took longest to find, and which version they are under. That decides the order better than this note.
- **Ask FORS.** Whether it has a route for software suppliers, accepts records from a portal as evidence, or has a rule against a product
  describing itself as "FORS ready". Until answered, **do not use FORS's name or logo in the product or sales material** beyond naming the
  requirement numbers.
- **Starter policy wording.** Offering templates helps, and carries a risk if a firm relies on them. Say "an example" everywhere, and have
  it read by someone who knows the audit, once.
