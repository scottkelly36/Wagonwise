# Privacy: what changed, and what still needs doing (2026-11-04)

Not legal advice. This is the list to take to a solicitor and to use when filling the store forms. The published notice is
`sites/landing/privacy/index.html`; the in-app summary is `apps/driver-app/src/app/consent.tsx`.

## What the notice now says that it did not (last updated 4 November 2026)

- **SOS:** a row in section 2, a bullet in section 3 and section 4, and the roles in section 1. What is sent (name, how the driver signs
  in, vehicle, job, position, three words, time), to whom (the company the driver drives for, by email and a portal alert), how long
  (30 days after it closes; deleted with the account), and that WagonWise does not contact the emergency services.
- **Places a driver marks,** including Share with all drivers and the three-reports rule.
- **Walk-round checks:** a row, with the company's retention (1 to 120 months, 12 by default).
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

## Store forms (match the notice)

- **Google Play Data safety:** precise location (collected, shared with the company on a job and on SOS, not for ads), email and
  phone number, name, photos (delivery and check photos), user content (reports, places, feedback), device ids (push token). Encrypted in
  transit; deletion available in the app and at `/delete-account`.
- **Apple privacy labels:** the same list, plus contact info for sign-in; location is linked to the user. Not tracking.
- When password, Google and Apple sign-in ships (on hold until after the app release): add Google and Apple as sign-in services,
  the email address as the sign-in, and a note that passwords are stored scrambled.
