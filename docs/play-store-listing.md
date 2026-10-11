# Google Play listing: draft answers

**A draft for the owner to check and paste into Play Console, not legal advice.** Written 2026-10-11 from the code and
config (`apps/driver-app/app.config.ts`, the consent screen, the server modules), not from the built app. Before submitting:
open the uploaded build in Play Console (App bundle explorer, Permissions) and make sure this list matches what Google sees,
and have the solicitor read the Data safety answers against the final privacy notice. **Over-declaring is safer than
under-declaring**: a mismatch between the form and what the app does is a common reason for rejection or removal.

Package: `com.wagonwise.driverapp`. Developer account: personal, so a closed test (about 12 testers opted in for 14
continuous days) comes before production access.

## Before the app content section can be finished

- A **public privacy policy page** (the web address goes in the form). The landing page can host it. Needs the company name,
  number and address, so the registration comes first.
- A **public page for deleting an account** (Play wants a web address as well as the in-app option). The app already has
  Delete account on the More tab; the page says how to ask for the same by email, and what is kept (see the consent screen).
- A **reviewer login**: the app needs sign-in (a phone or email code, and an invite code), so Google's reviewers need a working
  account and instructions in the App access section. Create a test driver and keep its invite code and email inbox usable.
- A contact email shown on the listing.

## Data safety (draft)

Encrypted in transit: **yes** (HTTPS everywhere). Users can ask for deletion: **yes** (in the app, and on the web page).

| Data type (Play's names)                                                                                   | Collected | Purpose                                                       | Shared with others                                                                            | Optional?                 |
| ---------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| Approximate and precise location                                                                           | Yes       | App functionality (routes, hazard and parking warnings, ETAs) | The driver's company, only while on one of its jobs (a company sees position through the app) | Needed for navigation     |
| Phone number, email address, a name or identifier                                                          | Yes       | Account sign-in and management                                | Text/email sent through an SMS and an email provider (see below)                              | Needed to sign in         |
| Photos (proof-of-delivery)                                                                                 | Yes       | App functionality (proof for the company)                     | The company that set the job                                                                  | Only on jobs that need it |
| Audio: voice                                                                                               | Check     | App functionality (spoken hazard reports)                     | The words, as text, go to our server and to an AI service (see below)                         | Optional                  |
| App activity: hazard and congestion reports, parking marks, driving-hours log, walk-round checks, feedback | Yes       | App functionality                                             | Hazard reports are shown to other drivers with no name                                        | Mostly optional           |
| Device or other IDs (push token)                                                                           | Yes       | Notifications (job and route alerts)                          | Expo's push service                                                                           | Optional                  |
| Financial info, health, contacts, messages, web browsing                                                   | **No**    |                                                               |                                                                                               |                           |

Notes for each:

- **Audio.** The app does not store recordings. The phone's speech service turns speech into text. **Check** (the speech package
  `expo-speech-recognition`) whether Android sends the audio to Google for recognition; if it does, declare "Voice or sound
  recordings" as collected. The resulting text is stored and sent to the AI service for parsing into a hazard report.
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
