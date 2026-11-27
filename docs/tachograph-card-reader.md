# Reading a tachograph driver card in the app: step 1 (2026-11-26)

Stage 2 of `tachograph-download-scope.md`, started at the owner's request ("use a card reader and have the data in the app"). **Step 1 is
the reading logic and a simulated card, with no reader.** What exists is in `apps/driver-app/src/lib/tachograph-card/`. What does not
exist yet is the USB layer (a native module), so nothing in a shipped build can read a real card, and **nothing has been tried on a
real card or reader**.

## What is built (step 1)

- `apdu.ts`: the commands as bytes (select by name and by file id, read binary, perform hash of file, compute digital signature, get response).
- `card-files.ts`: the first-generation driver card's files, in the order they are read, which are signed, and how each size follows from the
  counters in EF_Application_Identification.
- `download-card.ts`: `downloadDriverCard(reader)` reads the card and builds the download file, with progress, cancel, and plain-word errors.
- `ddd.ts`: the download file's layout, written and read back.
- `reader.ts`: the `CardReader` interface a real reader must satisfy, and `exchange` (follows `61xx` "more data" and `6Cxx` "wrong length", which a
  T=0 reader leaves to us).
- `simulated-card.ts`: a fake driver card behind a reader for building and testing. Everything on it is invented (random bytes of the right
  size, a holder called SIMULATED, fake signatures), so no real person's record is ever used.
- Tests (`tachograph-card.test.ts`, 21): the exact command bytes, the file order, that a signature follows exactly the signed files, that the
  download is the card's bytes unaltered, T=0 behaviour, and each failure (no card, card removed, not a driver card, a missing file, a card that
  will not sign, stopped).

The download is **not read**: no hours, names or dates are pulled out of it. The bytes go through unaltered, then through the existing
"send to my firm" flow. That is deliberate: reading is step 2, and a wrong guess about the format must not reach a driver.

## Where the facts come from (and how sure)

- **The read sequence and the commands:** the open-source Cardpeek tachograph script
  ([L1L1/cardpeek, tachograph.lua](https://github.com/L1L1/cardpeek/blob/master/dot_cardpeek_dir/scripts/tachograph.lua), GPL, read for the
  facts only, none of its code is used). It selects each file by identifier, sends `80 2A 90 00` (perform hash) then reads the file in pieces of
  at most 200 bytes, then sends `00 2A 9E 9A 80` (compute digital signature, 128 bytes back). The tachograph application is selected by name,
  `FF 54 41 43 48 4F`. Which files, in which order, and each one's size rule, are from the same script. Files 0002 and 0005 are read before the
  application is selected; the rest after.
- **The download file layout:** tag of three bytes (the file id, then `00` data or `01` signature for first generation, `02` and `03` for second),
  two bytes of length (big endian), then the bytes. From the open-source parser
  [traconiq/tachoparser](https://github.com/traconiq/tachoparser) (`pkg/scan/card.go`), which reads real files.
- **The list of driver card files and their identifiers:** the EU's interoperability test specification
  ([JRC, v2.3](https://dtc.jrc.ec.europa.eu/iot_doc/Interoperability_Test_Specifications_v2.3.pdf), section 8.2) and the two sources above.
- **The regulation itself** (Annex 1C, Appendix 7, the data downloading protocol) could not be fetched from here, so the exact wording of the
  download procedure is **not** checked against it. Do that, or compare with a real download, before relying on any detail below.

## What a simulation cannot prove

- **A real card and reader.** Whether the real card answers each command as the fake one does, including the status words and when it says
  `61xx`; whether the certificates (`C100`, `C108`) really are read inside the application as Cardpeek does (the EU test document's figure shows a
  vehicle unit reading them before selecting it, so this is the first thing to check); and whether the optional files behave as assumed.
- **The USB layer.** Power draw, which readers work on a phone, and reader behaviour. The native module must speak CCID over Android's USB host
  API, and a reader that works only at the level of the transport (not whole commands) is a risk (`exchange` handles `61xx` and `6Cxx` for that).
- **Timing.** How long a real card takes. The activity file alone is read in about 70 pieces, and the whole download in about 165 commands (a 24 KB file).
- **Newer cards.** Second-generation cards (issued since 2019 in the UK) hold a second copy of the application, and a download from one
  normally includes both. This reads the first generation only. A newer card works for it, but the download is not what a full tool writes.
- **That the signatures are valid.** Nothing here checks them.

## For the day a reader and card arrive (checklist)

1. Read the card with a free app that already works (for example [TachoAssist](https://tachoassist.com/card-reader/) or Tacho Card Reader on the
   Play Store) and keep the `.ddd`. It is the reference.
2. Compare it with what our logic expects: the same files, in the same order, with the same sizes, a signature after each signed one. A small
   script over `parseDdd` does it.
3. If the card or reader returns something different at any step, the commands log (`card.log` on the simulator, the same on a real reader)
   shows where to look.
4. Only then build the screen and the native module, and try the real reader.

## Readers

Not tested by us. Other apps say a phone with USB host (OTG) and a CCID-compliant smart-card reader are needed, and that the cable or adapter
must carry data, not only charge. The ACS ACR39U is named as tested by TachoAssist; Driver Card Reader Pro names ACS, Omnikey, Gemalto and
others. A "generic EMV smartcard reader" is also listed. Check the current store listings before buying: they change.

A genuine test driver card is not something I know a source for; a real driver card (your own) is the practical one. It holds personal data
(a name, a card number and a record of working time), so use only a card whose holder has agreed.

## Next

- Step 1 (this): reading logic, simulator, tests. Done.
- Step 1b (built): a test-only screen, More, "Read my card (test)" (`app/read-card.tsx`, `hooks/use-card-read.ts`, `lib/tachograph-card/scenarios.ts`).
  The driver picks a pretend card (a good one, one that answers in pieces, an older one, no card, pulled out part way, the wrong kind, one that will
  not sign, one missing a file), watches the read with progress, and sees either the summary (parts, sizes, how many signed) or the plain-word error.
  It is offered only in development and in `preview` builds (`eas.json` sets `EXPO_PUBLIC_CARD_SIMULATOR`; `lib/card-simulator.ts`), never in a store
  build, and it is JavaScript only so it can reach a preview build over the air. Nothing is sent anywhere. **Still to do:** end in the same
  send-to-my-firm confirmation as a picked file, once the file-sending screen (PR 449) is merged.
- Step 2 (built 2026-11-26, branch `tachograph-usb-reader`, **not yet tried on a real reader**): the real USB reader, for a `preview` build.
  - **Native, thin** (`modules/usb-card-reader`, Kotlin, Android only, compiled against the real SDK): lists USB devices, asks the driver's
    permission, opens a reader (USB class 0x0B), moves raw bytes over its two bulk endpoints, says when it is unplugged. No card knowledge.
  - **In TypeScript, tested** (`lib/tachograph-card/ccid.ts`, `usb-reader.ts`): the standard USB card-reader messages (power on, send a block,
    power off, slot status, parameters), the reader's class descriptor (what level it works at, which protocols), "still working" answers, stray
    messages, pieces of a long answer, and an empty slot or pulled card. It runs the same download as the simulator. `FakeCcidReader` plays a
    reader in tests (whole commands or transport level, small packets, time extensions, no card, silent), written from the same specification as
    the code, so it finds our mistakes and not a misreading of the standard or one maker's quirks.
  - **Refused, not guessed:** a transport-level reader that chooses T=1 (block framing is not written) and a reader that works one character at a time.
  - **The screen** (More, "Read my card (test)", a switch between "Real reader" and "Pretend card") reads a real card, keeps the file in memory,
    and offers **"Upload to {company}'s portal"** for each company that has switched on card files (the same notice and confirm as the picked-file
    screen, then the same send), with "Save or share the file instead" (the share sheet; nothing is sent by the app) and "Delete the saved copy".
    **Where it is:** a new **Hours** tab (Driving hours, each company's download status, "Read my card (test)" in test builds, "Send a card file"),
    no longer More.
    It also keeps a **log** of what the reader and card said (device numbers, the descriptor bytes, status words, sizes; never what is on the card)
    with "Share the log". Without it a first run on a real reader would tell us nothing.
  - **New packages:** `expo-sharing`, `expo-file-system` and the module, so this needs a new native build; the store 1.3.1 build does not have
    them. All JavaScript that uses them checks for them first. The Android manifest says USB host is optional so Play still shows the app to
    phones without it. Do not merge before the 1.3.1 store build unless that is wanted: the build would carry an untested native module.
  - **Trial order:** the owner's phone and a reader first; a training card if one can be had; a real card only with the holder's clear OK, not while
    they need it to drive. Compare the saved `.ddd` with one from a free app (checklist above), and send the log if anything fails.
  - **Order on the day, safest first:** the reader with no card in it (expect "No card in the reader"; the log shows permission, the descriptor and
    the slot status), then an old expired chip card (expect a plain-words error; it tests power-on and the protocol), then the real card.
  - **Installing:** an internal build is signed with a different key from the store app, so uninstall the store app first and sign in again.
  - **Over-the-air fixes to this build:** publish from this branch (not main) with `EXPO_PUBLIC_CARD_SIMULATOR=true` in the environment of
    `eas update --channel preview`: `eas.json`'s `build.preview.env` applies to builds only, and without it More loses the screen.
  - **Power on:** the reader is asked to pick the voltage; if it cannot, each voltage it supports is tried, lowest first.
- Step 3: showing what is in the file (the period it covers first; days of activity only after it matches a real download), labelled as
  from the card file and not the legal record.
