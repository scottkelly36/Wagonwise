# Tachograph downloads in the app: scope

Scoped 2026-11-15 at the owner's request: how hard would it be to download tachograph data in the driver app, from the driver's card or from
the vehicle unit. **Nothing is built.** What was read is named; what could not be confirmed is said so. GOV.UK could not be reached from where
this was written, so every legal figure below is from secondary sources and **must be checked on GOV.UK before anything is built or said to a
firm**.

## The short answer

- **Driver card, with a small USB card reader on the phone: doable, medium to large.** Other apps already do it. It needs native code and so
  a store build, and it needs the driver or firm to own a reader, which is the first piece of hardware WagonWise would ask anyone to buy.
- **Driver card, over Bluetooth with no reader: doable only on the newest tachographs** (smart tachograph 2). The groundwork is already in
  the repo. Most lorries on UK-only work will not have one.
- **Vehicle unit: hard, and not worth doing in the app.** It needs the firm's company card and, on most units, a cable or a download tool
  in the cab. Take the file from whatever tool the firm already uses instead.
- **The download is the smaller half.** A file is only useful if the office can store it, see what is overdue, and hand it to DVSA
  unaltered. Reading the hours and infringements out of it is a much bigger job again, and one where a wrong answer costs a firm money.

## What a download is

A digital tachograph keeps two records: the **driver card** (that driver's activity, about 28 days of it) and the **vehicle unit** (everything
that vehicle did, about a year). The firm must copy both off regularly, keep the files, and produce them when asked. The files are signed by
the card or the unit, so a copy that has been altered can be told from one that has not. The usual file is a `.ddd`.

**Figures, checked on GOV.UK 2026-11-26** ("Drivers' hours: goods vehicles", responsibilities of vehicle operators): download a driver card
at least every **28** calendar days and a vehicle unit at least every **90**, and be able to produce records to enforcement officers for
**12 months**. The vehicle unit download needs a **company card**. (Earlier secondary sources gave other figures for the card and unit; the
GOV.UK page is the one the product uses.) The page does not say how the files must be kept or handed over, so "unaltered" is our own
safe practice, not a quoted rule.

**Stage 1 built 2026-11-26** (`modules.md`, "Tachograph files"): the portal tracker, upload from any tool, and the driver app sending a
driver card file the driver picked from the phone. No reader and no Bluetooth: the file comes from whatever tool the driver or firm already uses.

## Ways to get the data, and how hard each is

### 1. Driver card through a USB card reader (M to L)

The card is a contact chip card. A phone cannot read it by NFC, so it needs a reader plugged into the phone. The app sends the card standard
commands, reads each file, asks the card to sign it, and writes the result out as a `.ddd` (the layout is Appendix 7 of the tachograph
regulation, public on legislation.gov.uk).

- **Android:** a USB reader on the phone's port (an adapter on older phones). Android lets an app talk to a USB device directly. No Expo
  package does this, so it is a small native module of our own. **A native change: version 1.3.0 and a Play build.**
- **iPhone:** Apple supports standard (CCID) card readers from iOS 16, through its CryptoTokenKit, and developers report it working over
  **USB-C only, not Lightning**, so in practice iPhone 15 and later. Some readers need more power than a phone gives, and one developer
  reported occasional failures with a particular reader, so the readers we name would each need testing. Another native module, and App Review.
- **What is known to work:** Tachogram and TachoData both read a driver card through a reader on Android and iPhone, so the route is proven.
- **Unknown until tried:** how long a full card read takes on a phone, and which readers behave. Needs a real driver card and two or three
  readers on a desk.

### 2. Driver card over Bluetooth from a smart tachograph 2 (M, on top of work already planned)

The newest units (VDO DTCO 4.1, Stoneridge SE5000-8.1) have a Bluetooth Low Energy interface for outside apps, with a **Download** service.
TachoData's store listing says it downloads a driver card this way with no reader, even while driving. The driver has to pair the phone and
give consent on the tachograph.

- **Already in the repo:** `apps/driver-app/src/lib/tachograph/` has the Bluetooth packet framing, flow control and a simulator, written
  2026-10-10 for reading driving hours. It already names the Download service. It is not wired into the app, and no Bluetooth library is
  installed yet (that is the same 1.3.0 native build).
- **Who has one:** smart tachograph 2 is required for international work (retrofit dates 31 December 2024 and 19 August 2025). Vehicles
  used only within the UK are exempt, and a smart tachograph 1 can still be fitted to them. So a Hexham firm on domestic work may have none.
- **Unknown:** the exact download commands over Bluetooth (the earlier work found the application protocol hard to get hold of), and
  whether a real unit behaves as the documents say. Needs a real unit.

### 3. Vehicle unit (L to XL, not recommended)

- Needs the **company card** in the unit, or held by a service that answers for it remotely.
- On most units the data comes out of a socket on the front with a download key or cable, or through a telematics box wired in behind the
  dash. Both are hardware in the cab, which WagonWise has said it will not do.
- On a smart tachograph 2 the regulation describes downloads over the Bluetooth interface; whether a vehicle unit download works that way
  in practice, and how the company card is presented, was **not confirmed**.
- Firms already own a download key or pay someone to do this. Better to accept the file they already produce (stage 1 below).

### 4. From the firm's telematics (not sized)

Listed in `phase-3-scope.md` as Track C. If a firm's lorries already have Webfleet, Samsara or similar doing remote downloads, the files
could be fetched from that provider. One integration per provider; only worth it for a firm that asks.

## What has to exist around the download

- **Somewhere to put the files** (core and the portal): stored per driver and per vehicle, never changed, downloadable as they were, with
  the firm's own retention period as photos have.
- **A tracker:** when each card and each unit was last downloaded and when the next is due, with reminders. `fors-scope.md` already asks
  for this (item 3). It is useful even if the app never downloads anything.
- **Checking the signature** on each file, so the portal can say a file is intact. Medium on its own.
- **Reading the file** (activities, then the drivers' hours rules, then infringements): large to very large, different for each
  generation of card, and the place where a mistake matters most. Firms already pay for this (Tachomaster, Tachogram and others).
- **Wording:** storing and reminding is not being compliant. Never say a firm is compliant because its downloads are up to date.

## Privacy

It is the driver's working-time record, so it is personal data. A firm has a legal duty to download its drivers' cards, which is a different
footing from the driving-hours sharing a driver opts into (`driver-hours-consent.md`). The privacy notice, the DPIA and the store data forms
would all need a new row, and a driver must be told plainly who receives the file. A driver with no company in the app keeps the file on
the phone and shares it themselves.

## Suggested order

1. **Portal: the download tracker, and uploading a `.ddd` from any tool the firm already has** (S to M, no hardware, no app change).
   Proves whether firms want their files in WagonWise at all.
2. **App: driver card through a USB reader, Android first** (M to L), in the 1.3.0 native build, sending the file to the firm from stage 1.
   iPhone after, for USB-C phones.
3. **App: driver card over Bluetooth**, once a real smart tachograph 2 is to hand, sharing the Bluetooth work with driving hours.
4. **Vehicle unit:** upload only. Do not build a download.
5. **Reading the files:** not until a paying firm asks, and then consider a partner before writing a rules engine.

## What to find out first

- What tachographs the first firms' lorries have (already an open question in `progress.md`), and how they download today: a key in the
  office, a third party, or telematics.
- Whether they would want drivers downloading their own cards from the phone, or would rather keep the office doing it.
- The download intervals, the retention period, and what DVSA expects of a stored file, from GOV.UK and the legislation.
- Whether asking a driver to buy a card reader fits "no hardware" (`AGENTS.md`). It is the driver's or the firm's reader, not ours, but it
  is still something to buy.

## Sources

Read on 2026-11-15, through search results rather than the pages themselves except where the repo already held the text:
[Tachogram's app page](https://tachogram.com/app), [TachoData on the App Store](https://apps.apple.com/py/app/tachodata/id6737516213),
[Appendix 13 of Regulation 2016/799](https://www.legislation.gov.uk/eur/2016/799/annex/1/appendix/13) and
[Appendix 7](https://www.legislation.gov.uk/eur/2016/799/annex/1/appendix/7),
[Continental's DTCO 4.1 leaflet](https://cdn.shopify.com/s/files/1/0809/0170/1956/files/dtco_4-1-leaflet-en-2023-05.pdf),
[GOV.UK: responsibilities of vehicle operators](https://www.gov.uk/guidance/drivers-hours-goods-vehicles/5-responsibilities-of-vehicle-operators) (not reached),
[approved tachograph centre special notice 01-25](https://www.gov.uk/government/publications/approved-tachograph-centre-special-notice-01-25/approved-tachograph-centre-special-notice-01-25),
[Apple's deployment guide on smart cards](https://support.apple.com/guide/deployment/depd0b888248), and Apple developer forum threads
[749896](https://developer.apple.com/forums/thread/749896) and [820659](https://developer.apple.com/forums/thread/820659).
