# Google Play listing: draft answers

**A draft for the owner to check and paste into Play Console, not legal advice.** Written 2026-10-11 from the code and
config (`apps/driver-app/app.config.ts`, the consent screen, the server modules), not from the built app. Before submitting:
open the uploaded build in Play Console (App bundle explorer, Permissions) and make sure this list matches what Google sees,
and have the solicitor read the Data safety answers against the final privacy notice. **Over-declaring is safer than
under-declaring**: a mismatch between the form and what the app does is a common reason for rejection or removal.

Package: `com.wagonwise.driverapp`. Developer account: personal, so a closed test (about 12 testers opted in for 14
continuous days) comes before production access. The company now exists (WagonWise Ltd, company number 17530209), but the
Google account is still personal: as far as I know Google does not convert a personal account, so an organisation account would need its own
D-U-N-S number and a fresh closed test. Not worth it unless the personal account is a problem.

## Before the app content section can be finished

- A **public privacy policy page** (the web address goes in the form). The landing page can host it. Needs the company name,
  number and address: WagonWise Ltd, company number 17530209 (the page names it); the registered office is 5 Portland Terrace, Hexham NE46 3DT
  (on the privacy page).
- A **public page for deleting an account** (Play wants a web address as well as the in-app option). The app already has
  Delete account on the More tab; the page says how to ask for the same by email, and what is kept (see the consent screen).
- A **reviewer login**: the app needs sign-in (a phone or email code, and an invite code), so Google's reviewers need a working
  account and instructions in the App access section. Create a test driver and keep its invite code and email inbox usable.
- A contact email shown on the listing.

## App access instructions for Google's reviewers (draft)

Play's reviewers cannot read an inbox or a phone you control, and the app signs in with a one-time code. So the instructions
must give them a way to get the code. **The simplest honest option is a mailbox the reviewers can open**: a dedicated address
(for example reviewer@wagon-wise.co.uk), with its webmail address and password written in the App access form, and the password
changed after review. Never put these in chat or in the repo; type them straight into Play Console.

The alternative is a review account with a fixed code, which needs a small change in core (a setting that gives one named
account a known code, off in normal use). It is more reliable for reviewers but it is a way past sign-in, so it needs your say-so
and a security review before it is built.

Text for the form (fill the brackets):

> WagonWise needs sign-in. There is no password: you sign in with a one-time code sent to an email address, and a one-time
> invite code is needed the first time.
>
> 1. Install the app and open it. Read the privacy screen and tap "I understand".
> 2. On the sign-in screen, enter the email address **[reviewer email]**.
> 3. Enter the invite code **[invite code]**.
> 4. A six-digit code is sent to that address. Open **[webmail address]** and sign in with **[reviewer email]** and the password
>    **[password]** to read it, then type the code into the app.
> 5. On the map you can: search for a place and plan a route (the app asks for location while it is open, and the camera and
>    microphone only if you use proof photos or voice reports); open More > Vehicle profiles to see a sample vehicle; tap the
>    hazard button to see how a report is made.
> 6. To delete the account: More > Delete account. There is also a page at https://wagon-wise.co.uk/delete-account/.
>
> The account is for review only and holds no real data. If anything fails, contact support@wagon-wise.co.uk.

Checks before you submit: make a fresh invite code (each works once), sign in yourself on a clean phone with exactly these steps,
and make sure the mailbox receives the code within a minute.

## Data safety (draft)

Encrypted in transit: **yes** (HTTPS everywhere). Users can ask for deletion: **yes** (in the app, and on the web page).

| Data type (Play's names)                                                                                   | Collected      | Purpose                                                       | Shared with others                                                                            | Optional?                 |
| ---------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| Approximate and precise location                                                                           | Yes            | App functionality (routes, hazard and parking warnings, ETAs) | The driver's company, only while on one of its jobs (a company sees position through the app) | Needed for navigation     |
| Phone number, email address, a name or identifier                                                          | Yes            | Account sign-in and management                                | Text/email sent through an SMS and an email provider (see below)                              | Needed to sign in         |
| Photos (proof-of-delivery)                                                                                 | Yes            | App functionality (proof for the company)                     | The company that set the job                                                                  | Only on jobs that need it |
| Audio: voice                                                                                               | Yes (see note) | App functionality (spoken hazard reports)                     | The words, as text, go to our server and to an AI service (see below)                         | Optional                  |
| App activity: hazard and congestion reports, parking marks, driving-hours log, walk-round checks, feedback | Yes            | App functionality                                             | Hazard reports are shown to other drivers with no name                                        | Mostly optional           |
| Device or other IDs (push token)                                                                           | Yes            | Notifications (job and route alerts)                          | Expo's push service                                                                           | Optional                  |
| Financial info, health, contacts, messages, web browsing                                                   | **No**         |                                                               |                                                                                               |                           |

Notes for each:

- **Audio (checked 2026-10-15).** The app does not store recordings. `use-voice-report-capture.ts` starts the phone's speech
  recognition with language `en-GB` and does **not** ask for on-device recognition (`requiresOnDeviceRecognition` is not set), so
  on Android the phone's own speech service (Google's) may send the audio to Google; whether it does depends on the phone. The
  resulting text is stored with the report and sent to the AI service for parsing into a hazard report.
  **Suggested answer, to confirm against Play Console's wording:** declare "Voice or sound recordings" as collected, purpose
  App functionality, optional, processed ephemerally and not stored by us, and not shared with others (it is handled by the
  phone's own speech service). That is the cautious answer. The alternative is to ask for on-device recognition in the app, which
  keeps the audio on the phone but fails on phones without an offline English model; that is a code change, not made.
- **Service providers.** Google does not count processors acting on your behalf as "sharing", but each still needs naming in the
  privacy notice: ClickSend (SMS codes), Resend (email codes), Expo (push), Anthropic (hazard text parsing), MapTiler (map tiles
  and address search), DigitalOcean (hosting). TomTom and the Met Office receive no personal data (TomTom gets only grid-snapped
  road points and boxes, no driver or route).
- **Retention.** Trip positions are kept up to 30 days (the consent screen says so). Companies choose their own retention for
  job photos (default 12 months).

## Permissions the app asks for

Location while the app is open (fine and coarse; **no background location** is requested, so the background-location
declaration form is not needed), camera (proof photos), microphone and speech recognition (voice reports), notifications.
The app does **not** run a foreground service. Confirm all of this against the real build's permission list.

## Content rating (IARC questionnaire): likely answers

Utility/navigation app. No violence, sexual content, gambling, drugs or bad language from the app itself. Two questions to
answer carefully: **users can share content with each other** (hazard reports, shown without names) and **shares the user's
location with others** (a driver's company sees their position on its jobs). Expected result: suitable for everyone, with the
user-interaction notes shown.

## Other declarations

- Target audience: **18 and over** (professional drivers). Not designed for children.
- Contains ads: **No**. In-app purchases: **No** (the driver app is free; companies are billed separately).
- News app, government app, health app, financial features: **No**.
- App category: **Maps & Navigation** (or Auto & Vehicles).

## Listing text (draft)

**App name:** WagonWise (from `PRODUCT_NAME` in `apps/driver-app/src/product.js`).

**Short description (80 characters):**
HGV navigation that avoids low bridges, with hazard and parking reports from drivers.

**Full description:**

> WagonWise is navigation made for HGV drivers.
>
> Plan routes that fit your vehicle's height, width, length and weight, and get warned about hazards ahead: low bridges,
> width and weight restrictions, and traffic reported by other drivers.
>
> - Routes for your actual vehicle. Save your HGV's dimensions once.
> - Hazards ahead, spoken so you can keep your eyes on the road. Report a hazard or traffic by voice.
> - Safe parking: lay-bys, services and spots other drivers have marked, with toilets, showers and food shown at a glance.
> - A faster route offered when traffic builds, so you can switch or keep going. It never changes your route by itself.
> - A driving-hours clock and break planning (a guide only: your tachograph is the legal record).
> - If you drive for a company, accept its jobs, share your position with it while on the road, and take proof-of-delivery
>   photos.
>
> Free for drivers. WagonWise is a guide: always follow road signs and the law.

(Cover the claims against what the pilot has actually tested. Remove anything not live on the day you submit. The accent and
cab-noise accuracy of voice is still unproven, so do not promise it.)

## Graphics Play needs

| Item                   | Size and rules                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App icon               | 512 × 512 PNG, up to 1 MB. **Made:** `apps/driver-app/store-assets/play-icon-512.png` (the launcher artwork, white corners filled so it is a full square).        |
| Feature graphic        | 1024 × 500 PNG or JPG, no transparency. **Made (first version):** `apps/driver-app/store-assets/play-feature-graphic-1024x500.png`.                               |
| Phone screenshots      | 2 to 8, at least 320 px on the short side; a 9:16 shape works. Use real screens: route map, hazard warning, parking card, the faster-route card, the trip screen. |
| (Optional) promo video | A YouTube link.                                                                                                                                                   |

## Screenshots to take (in this order)

Play shows the first two or three in search results, so lead with the strongest. Take eight; Play allows up to eight and
needs at least two. Each gets a short headline when framed (suggested wording below).

**How to take them clean**

- Use the **dark theme** for all of them so the set looks like one product (More tab, Appearance), and a real Android phone
  or the emulator at 1080 × 1920 or taller, portrait. The emulator is fine and avoids showing your own location.
- Pick a **plain, recognisable route** in the north-east (for example Hexham to Newcastle). Do not show a home address, a real
  customer, a real company name, a real number plate or another driver's details. Use a test company and a made-up
  registration.
- Phone status bar: full battery, full signal, no other app notifications, time around 09:41.
- Take them from the **latest build**. Re-take any screen that has changed by the day you submit.
- Save as PNG, full size, with names like `01-route.png`. Put the raw files in `apps/driver-app/store-assets/raw/`.

| #   | Screen                               | How to set it up                                                                                                                   | Headline (suggested)                      |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | **Trip map**, mid-route              | Start a route; map following the blue line, the next-turn banner and the ETA card showing. This is the hero shot.                  | Navigation made for HGV drivers           |
| 2   | **Route options** before setting off | Plan a route and show Fastest and Shortest side by side with distance and time (and fuel cost if the profile has consumption set). | Routes that fit your vehicle              |
| 3   | **Hazard warning ahead**             | A route passing a reported low bridge or width restriction; the hazard marker and its warning visible on the route.                | Hazards before you reach them             |
| 4   | **Safe parking**                     | The parking card with the seven facilities (green for known, grey for unknown); layby/service area markers on the map.             | Find safe parking                         |
| 5   | **Faster route offered**             | Needs a congestion report on your route and a clear saving: the "Faster route: saves X minutes" card with Switch and Keep.         | A quicker way, when traffic builds        |
| 6   | **Voice hazard report**              | The report button in use ("Listening…" or the spoken confirmation shown).                                                          | Report hazards by voice                   |
| 7   | **Break planning**                   | The break card ("Break needed in 1 h 20 min", parking options) with the driving-hours quick bar on the trip screen.                | Plan breaks into the route                |
| 8   | **A company job**                    | The job screen: stops, next action, and the proof-of-delivery step, for drivers who work for a company.                            | Jobs from your company, with proof photos |

Optional extras if there are slots left or Play asks for more: vehicle profiles (the dimensions form), saved places, and the
weather warning badge.

Do **not** use: the sign-in screen, the privacy notice, errors, empty states, or anything that shows a real person.

## Recruiting closed-test testers

- At least 12 people who stay opted in for 14 days in a row; aim for 15 to 20.
- Each needs an Android phone and a Google account, and to accept the invitation link.
- Each needs an invite code to register in the app (the Invite codes page in the dashboard).
- Tell them it is a test, what the app collects (the consent screen shows this), and how to leave.
- Google asks how the testing went when you apply for production, so ask testers to actually use it and report problems.
