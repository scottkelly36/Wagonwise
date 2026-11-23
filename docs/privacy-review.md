# Privacy: what changed, and what still needs doing (2026-11-04)

Not legal advice. This is the list to take to a solicitor and to use when filling the store forms. The published notice is
`sites/landing/privacy/index.html`; the in-app summary is `apps/driver-app/src/app/consent.tsx`.

## What the notice now says that it did not (last updated 4 November 2026)

- **SOS:** a row in section 2, a bullet in section 3 and section 4, and the roles in section 1. What is sent (name, how the driver signs
  in, vehicle, job, position, three words, time), to whom (the company the driver drives for, by email and a portal alert), how long
  (30 days after it closes; deleted with the account), and that WagonWise does not contact the emergency services.
- **Places a driver marks,** including Share with all drivers and the three-reports rule.
- **Walk-round checks:** a row, with the company's retention (1 to 120 months, 12 by default). **A check that found a defect is always kept at least 15 months** (the legal minimum for drivers' defect reports in DVSA's guide, 2026-11-08), so the notice says so; a check with nothing wrong goes at the company's choice.
- **Staff mobile number** (for text reminders) in the staff row.
- **Fuel stations** added to what the driver's position is used for.
- **Services:** what3words and DVSA added to the table; Resend and ClickSend now also cover SOS emails and maintenance reminders. A
  paragraph says the Met Office, National Highways, GOV.UK fuel prices and OpenStreetMap are open data we fetch for everyone, so none
  of a driver's data goes to them (checked: the Met Office client fetches the national warning feed and matches position on our side).
- **The in-app "Before you start" screen** said a trip position is stored for up to 30 days. It is not (only the planned route is kept
  for 30 days; `lastPosition` is never written), so the screen now says that. It also now mentions SOS, shared places, check records,
  and links to the notice. This is JavaScript only and goes out over the air with the next `release` label.

## Decisions for the owner

- **Existing drivers are asked again, once** (owner, 2026-11-04). Not by clearing `consentedAt` on the server: the app keeps a cached copy of the
  driver and never refetches it, so clearing would not reach anyone already signed in, and it would wipe the record of when they first
  accepted. Instead the app keeps the version of the text each driver accepted on the phone (`CONSENT_VERSION` in
  `lib/consent-version.ts`, now `2026-11-04`) and shows the screen on the next launch when it is missing or older; accepting records
  the new date on the server as before. **Change `CONSENT_VERSION` whenever the text changes in a way drivers should be asked about
  again.** A driver signing in on another phone sees it once there too. **Ship this with the new text, never before it** (it is the
  same change), or drivers are asked to accept the old text again.
- **The notice goes live when the landing site is deployed** (not with core or the app).

## For the solicitor

- Who is the **controller for SOS**: WagonWise (the driver asks for it, we send it) or the company (it receives and acts on it)? The
  notice says the company is, and that we act for it. Check, and whether SOS needs its own lawful basis (vital interests is one to
  ask about) rather than the wording used in section 4.
- **Places shared with all drivers:** WagonWise as controller; is "never your name" enough given that a place near someone's home or
  yard can point to them?
- **Walk-round check records** survive account deletion (the company's records). Fine as a company record? The notice says so.
- **Position of a driver with no company who presses SOS:** nothing is stored or sent; the sheet shows the three words to read out.
- The `[brackets]` still in the notice and the DPA, and registering with the ICO.

## DPA and DPIA (company contract)

Add: SOS alerts and check records as data WagonWise handles for the company; what3words and DVSA as sub-processors (and the DVSA
point that only a registration number goes); the 30-day deletion of closed SOS alerts; check retention set by the company; the
staff mobile number for text reminders. A DPIA should now cover SOS (location plus identity, sent by email) and shared places.

## Sales notebook (added 2026-11-08)

WagonWise now keeps its own list of the firms it is approaching (`sales.prospects` and `sales.entries`; platform staff only, in the
admin portal). It holds business contact details copied from public sources (a firm's name, town, phone number, mailbox, the person
to ask for) and the owner's own notes of each call or message. Some of the firms are sole traders or partnerships, so their details
are personal data. It is not drivers' data and never touches the app.

- **A firm that asks not to be contacted is kept for good** (its name and the fact of the request), so it is never contacted again by
  mistake. It cannot be deleted from the page; its phone number and mailbox can be removed. Any other firm and its log can be deleted.
- **Add to the DPIA and the records of processing:** a prospects list, held by WagonWise for its own sales, from public directories
  and company websites, kept while a firm is a prospect.
- **Questions for the solicitor:** do the people on this list need to be told where their details came from, and where (the cold
  message's opt-out line is the first contact)? Is "kept for good" enough for the opt-out record? How long should a firm that never
  replied stay on the list?

## Audit pack history (added 2026-11-08)

The audit pack (Compliance) shows who changed a defect's status and who entered or corrected a maintenance date. The history is kept in
`checks.defect_events` and `maintenance.date_changes` as the staff account's id and a time, never a name; the name is looked up when a pack is
made, so a person who has left shows as "Someone no longer on the account". Staff are the company's own employees acting for the company.
A check's defect history is deleted with the check: a check that found a defect after the longer of the company's retention and 15 months. The date changes are
**not** deleted by any retention rule today. Question for the solicitor: how long should they be kept? The pack can be handed to an inspector
or another third party by the company; the notice does not need to change for that, but the company should know the names are in it.

## Store forms (match the notice)

- **Google Play Data safety:** precise location (collected, shared with the company on a job and on SOS, not for ads), email and
  phone number, name, photos (delivery and check photos), user content (reports, places, feedback), device ids (push token). Encrypted in
  transit; deletion available in the app and at `/delete-account`.
- **Apple privacy labels:** the same list, plus contact info for sign-in; location is linked to the user. Not tracking.
- **Flow events (2026-11-17, `flow-tracking-plan.md`):** Play: "App activity: app interactions", collected, not shared, for analytics,
  optional. Apple: "Usage data: product interaction", **not linked** to the user, for analytics; still not tracking (first party, no
  advertising). Change both before the app release that sends them.

## Market research contact (added 2026-11-23)

- **What:** an optional switch in the portal's Settings: "WagonWise may contact me from time to time to ask for feedback, to help improve the system." Stored per person: yes or no, the date, the version of the wording shown, and the company. Append-only, so it can be shown what a person agreed to and when they changed their mind.
- **Never a condition:** unticked until the person ticks it; using WagonWise does not depend on it; one click withdraws it; nobody is contacted for research unless their latest answer is yes to the current wording. Existing customers' staff are **not emailed to ask**: they see the switch in Settings and a one-time note on the Overview.
- **Off until you say:** `RESEARCH_CONTACT_ENABLED` is false, so the switch is hidden and answers are refused. **For the solicitor:** the wording; how it sits beside the privacy notice and the terms (it should not be part of the terms checkbox); what basis to give for contacting (consent is what is recorded); and whether a withdrawal link is needed in every research email once any are sent. This file is not legal advice.
- **Privacy notice, a paragraph to add:** "If you tick the box in your Settings, we may contact you from time to time to ask for feedback and to help improve WagonWise. We keep your answer, the date and the wording you saw. You can change your mind at any time in Settings and we will not contact you for this again. Using WagonWise does not depend on it."
- **Withdrawal records:** the rows are kept (they are the evidence of what was agreed and when it was withdrawn); a person who leaves a company drops off the list because their account no longer exists. Say how long the rows are kept once the retention schedule is settled.

## Flow events (added 2026-11-17)

- **What:** which steps a driver reaches and the fixed choices made on them (`FLOW_EVENT_CHOICES` in `packages/contracts`). No position,
  place, search text or three words; no driver, account or device id: a random session id made when the app opens. 90 days at most.
- **Basis:** legitimate interests (improving the app), stated in the notice (section 2's table and section 4), with an opt-out on the
  More tab, on by default. No consent is asked.
- **For the solicitor:** does storing the queue on the phone fall under PECR's storage rule, and does the analytics exception added by
  the Data (Use and Access) Act 2025 cover it with the notice and the opt-out as they are? Not checked against the Act's text here.
- **DPIA:** a short row: anonymous, low risk; the main risk is the fixed lists growing to include something identifying, which the
  contract test guards against.
- When password, Google and Apple sign-in ships (on hold until after the app release): add Google and Apple as sign-in services,
  the email address as the sign-in, and a note that passwords are stored scrambled.
