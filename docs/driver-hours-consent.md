# Driver hours: sharing a driver's status with their company

**Status: approved by the owner on 2026-10-09 and built (migration 0054). The wording and rules below are what the app and portal
do. Still for a solicitor to read before it is used with real drivers; the main question is below.** It is not legal advice.

The driving-hours clock (built: the clock, break planning, weekly limits) stays on the driver's phone and tells nobody. This
document is about the one step beyond that: letting a driver's company see their **status** next to their job on the live map.

## What would be shared, in plain words

Only this, and only while the driver is on a job for that company:

- the driver's **status**: driving, other work, on a break, or not on a shift;
- **how much driving time they have left** before their next break or limit (for example "1h 20m"), and which it is.

Never shared: the history of what the driver tapped, their weekly or fortnightly totals, their rests, or anything from before
the job. Nothing from a tachograph (there is no connection yet). The company does not get a record of hours; it sees a live
status, and the status is replaced each time it changes.

## The rules the build must follow

1. **Off unless the driver chooses.** Two switches must both be on, and either one off means nothing is sent or shown:
   - the **firm** switches the feature on for its drivers (off by default), and
   - each **driver** separately chooses to share with that company (off by default, per company).
2. **The driver can change their mind at any moment,** in the Driving hours screen, and it takes effect straight away: the app
   stops sending and the company's view of that driver's status is removed.
3. **Saying no costs the driver nothing.** The app works the same. It must not be made a condition of the job in the app, and
   the firm's screen does not show who has said no (it shows no status for them, the same as for a driver who is not on a shift).
4. **The driver can always see that sharing is on:** a chip on the Driving hours screen and the trip screen, like the existing
   "Your company can see your position" chip.
5. **Only the latest status is kept.** No history is stored. A status expires 12 hours after it was last updated, and is deleted
   when the driver withdraws, leaves the company, ends the job, or deletes their account.
6. **The wording must never read as a compliance guarantee** (the clock is a driver-entered guide; the tachograph is the legal
   record). The firm's screen carries the same note.
7. **Who at the firm sees it:** the same staff who see the live map, nobody else.
8. **Not used for** pay, discipline or any record of hours. The product does not offer an export of it.

## Wording: the driver's screen

Shown the first time a driver turns sharing on (and available any time from the Driving hours screen), one company at a time:

> **Share your driving status with {company}?**
>
> If you say yes, {company} will see on their live map whether you are driving, on a break or on other work, and roughly how much
> driving time you have left, while you are on one of their jobs. They will not see what you tapped earlier, your weekly totals,
> or anything when you are not on a job.
>
> This is your choice. The app works exactly the same if you say no, and you can switch it off at any time, which stops it
> straight away.
>
> This is a guide that you enter yourself. Your tachograph is the legal record, and you are still responsible for staying within the
> rules.
>
> [ Share with {company} ] [ No thanks ]

Once on, the Driving hours screen shows "Sharing with {company}" and a **Stop sharing** button.

## Wording: the firm's switch (dashboard)

Under the Checks and rules settings, off by default:

> **Show drivers' hours status on the live map.** Drivers choose for themselves whether to share. Nothing is shown for a driver who
> has not agreed. The status is a live guide the driver enters, not a record of hours; it is not stored as history and should not be
> used for pay or discipline. You remain responsible for your own drivers'-hours records and for the lawful basis for
> any monitoring of your staff.

## Additions for the privacy notice (WagonWise's driver-facing notice)

> **Driving hours.** If you use the Driving hours feature, what you tap (driving, break, rest) is kept on your phone for 15 days and
> is not sent to us. If you choose to share your status with a company you drive for, we send them your current status and the driving
> time you have left while you are on one of their jobs, so it can show on their live map. We keep only the latest status, delete it
> 12 hours after it was last updated, and delete it straight away if you stop sharing, leave the company, or delete your account.
> You can stop sharing at any time in the app. Sharing is always your choice.

## For the company's own records (their notice and DPIA; WagonWise supplies this as a starting point)

The company, not WagonWise, decides to switch the feature on and is responsible for its own lawful basis and for telling its
drivers. WagonWise provides the text above and the controls. Points for the company's data protection impact assessment:

| Question    | Answer                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| What data   | Live status and driving time left, per driver, while on a job. No history.                                                                          |
| Purpose     | Helping dispatch plan jobs and breaks safely; not pay, discipline or compliance records.                                                            |
| Necessity   | The driver can use the feature without sharing. Sharing is optional.                                                                                |
| Retention   | Latest only; expires 12 hours after the last update; deleted on withdrawal, job end, leaving or account deletion.                                   |
| Main risks  | Drivers feeling watched; pressure to share or to drive on; a wrong figure being relied on.                                                          |
| Mitigations | Off by default at both levels; the driver sees when it is on; no history; wording says it is a guide; the firm's screen does not show who declined. |

## Questions to put to a solicitor

- **Is consent the right basis between an employer and a driver?** Regulators note that consent between an employer and an employee
  is often not freely given because of the imbalance. Our design makes sharing a genuine choice with no consequence, but the
  company may need a different lawful basis (for example legitimate interests, with its own assessment) and the wording would then
  change from "consent" to "agreement" or a notice. This is the main question to settle before building.
- Who is the controller for this status: the company (we think), with WagonWise as processor under the existing agreement, which
  would need this processing added.
- Does turning it on need the company to consult its drivers first?

## Decisions for the owner

1. Approve the rules above (in particular: off at both levels, no history, 12 hours, not shown who declined).
2. Approve the wording, or change it.
3. Whether the firm's switch sits with the walk-round check settings, or somewhere of its own.

## What was built (2026-10-09)

A small `driver-hours` area in core with the firm switch, the driver's choice per company and the latest status; one call from
the driver app (only when both switches are on); a status chip on the live map; a "Sharing with {company}" line and Stop sharing
button in the app; a daily clean-up of stale statuses. Tests prove nothing is stored or shown unless both switches are on, that
withdrawing removes it at once, and that another company never sees it.

**Where it differs from the draft.** The firm's switch sits on the Checks page, under the rules for sending a vehicle out (owner's
choice). A status is hidden from the office the moment the driver's job ends or the driver stops sharing, but a row left by a job
that ended is physically deleted by the hourly clean-up once it is 12 hours old, not at the instant the job ends.
