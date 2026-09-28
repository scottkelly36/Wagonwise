# M7 Voice

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

## M7 task breakdown

| #    | Task                                                               | Status            |
| ---- | ------------------------------------------------------------------ | ----------------- |
| M7.1 | `HazardParser` port + Anthropic LLM adapter                        | Done — 2026-09-24 |
| M7.2 | Driver-app: on-device speech capture, mic button wiring            | Done — 2026-09-24 |
| M7.3 | Driver-app: parse + spoken confirm flow                            | Done — 2026-09-24 |
| M7.4 | Unconfirmed-drafts review screen (parked use)                      | Done — 2026-09-24 |
| M7.5 | End-to-end verification (as far as possible without a real device) | Done — 2026-09-25 |

Real-world speech-recognition accuracy against testers' actual accents and cab noise is
deliberately not tested cheaply now (design doc's own open question) — deferred to real-device
testing alongside M5.10, per this session's decision when M7 planning started.

**M7.5 delivered:** the deferred open question closed — the app and the voice hazard-reporting
flow were run on a real Android device (Expo Go/dev client, not an EAS build) on 2026-09-25, with
the driver's own accent and cab-style background noise. No accuracy problems found. The
TestFlight/Play EAS-build half of real-device verification is still open; tracked under M5.10.

**M7.1 delivered:** the `HazardParser` port (design doc §7 step 3) — the LLM half of voice
reporting — with a real adapter, not a stub. Core-only: no driver-app changes yet, since nothing
speaks a transcript to it until M7.2/M7.3.

- **`application/ports/hazard-parser.ts`**: `HazardParser.parse(transcript): Promise<ParsedVoiceReport>`
  (`{ type, note?, measurement?, positionHint? }`). Never rejects a transcript outright — the
  design doc's own fallback ("invalid output... falls back to type `other` with the raw transcript
  as the note") is part of the port's contract, not something a caller has to handle separately.
  Only a genuine infra fault (the LLM API unreachable, non-2xx) throws — the same "expected
  outcome is a value" shape as `RoutingEngine`'s `NoRouteFound` and `PushNotifier`'s swallowed
  error tickets.
- **`infrastructure/anthropic-hazard-parser.ts`**: hand-rolled HTTP to Anthropic's Messages API
  (decision 6/51's "hand-roll small, well-understood things," no SDK) — `claude-haiku-4-5-20251001`
  (cheapest/fastest tier, matching design doc §7's own "pennies at Phase 1 volumes" cost note), one
  forced tool call (`tool_choice: { type: 'tool', name: 'file_hazard_report' }`) so the model
  returns structured JSON directly rather than prose to re-parse. The tool's `input` is still
  zod-validated before being trusted — a forced tool call constrains the _shape_ the API will
  accept, not that a given call's content actually satisfies every rule (e.g. a positive
  measurement value) — invalid output is retried once, then falls back to
  `{ type: 'other', note: transcript }` exactly as designed. A non-2xx response or an unparseable
  body throws, same convention as `ValhallaRoutingEngine`/`ExpoPushNotifier`.
- **`infrastructure/null-hazard-parser.ts`**: always returns the `type: 'other'` fallback with no
  network call — wired as the default when `ANTHROPIC_API_KEY` is unset (decision 92, below).
- **`application/parse-voice-report.ts`**: a thin use case wrapping the port — no `Result`, since
  the port's own contract already never fails.
- **`POST /hazards/voice-reports/parse`** (core + BFF proxy): `{ transcript }` →
  `{ type, note?, measurement?, positionHint? }`. Gated by the existing `/hazards/` driver-auth
  prefix (no new prefix needed); no ownership check, same as confirm/dismiss/get — parsing isn't
  scoped to a reporter.
- **`packages/contracts/src/hazards.ts`**: `parseVoiceHazardReportRequestSchema`,
  `parsedVoiceHazardReportSchema` — `positionHint` has no counterpart on `hazardReportSchema`
  (design doc §7 step 5: kept as free text, never resolved to a location in Phase 1).
- **`config.ts`**: `ANTHROPIC_API_KEY`, optional — unlike `EXPO_ACCESS_TOKEN`, Anthropic's API
  genuinely requires a key, so unset wires `NullHazardParser` instead of failing to boot (decision
  92).
- **`hazards/api.ts`**: `createHazardsModule` wires `AnthropicHazardParser`/`NullHazardParser`
  itself from `anthropicApiKey`, same "module wires its own adapter" pattern as
  `ValhallaRoutingEngine`/`ExpoPushNotifier` — `composeCore` just passes the config value through
  plus an optional `hazardParser` override for tests, mirroring `pushNotifier`'s own shape exactly.

14 new core tests (`anthropic-hazard-parser.test.ts`'s 7, `parse-voice-report.test.ts`'s 1, 3 new
route tests, plus `config.test.ts` gaining 3 `ANTHROPIC_API_KEY` cases), 3 new contracts tests, 3
new driver-bff tests. 526 core tests total (up from 512), 47 contracts tests (up from 44), 80
driver-bff tests (up from 77). `pnpm arch` clean (349 modules, 1215 dependencies). `pnpm verify`
green end to end (lint, typecheck, test, arch, format:check).

**A real, if small, wiring bug was caught while verifying this, not by a test**: the new route's
handler threw a `TypeError` on every request (500, even for a missing/empty transcript that should 400) because `packages/contracts`'s `dist/` hadn't been rebuilt after adding the two new schemas —
`apps/core` resolves `@wagonwise/contracts` through its built output (decision 37), so the new
exports were simply `undefined` until `pnpm --filter @wagonwise/contracts build` ran. Not a code
bug, but a reminder that a schema change needs a contracts rebuild before its consumer can see it,
same lesson decision 37 already recorded for `node dist/main.js` vs `tsx`.

## Decisions from M7.1

91. **`HazardParser`'s retry-once-then-fallback lives inside the adapter, not the use case.**
    `parseVoiceReport` (`application/`) is a one-line passthrough; `AnthropicHazardParser` owns
    deciding what counts as "invalid output" and when to give up, because that's specific to how
    _this_ adapter's output can fail (no tool_use block, or a tool_use block that fails schema
    validation) — a hypothetical second LLM adapter would have its own failure shapes to reason
    about, not necessarily the same ones.
92. **`ANTHROPIC_API_KEY` unset wires `NullHazardParser`, not a boot failure — and this is a
    different situation from `OtpSender`'s still-unresolved SMS/email provider (M1.5 deviations).**
    The provider _is_ chosen here (Anthropic); what's missing is just a key in a given dev
    environment. Falling back to the same `type: 'other'` outcome the real adapter itself falls
    back to on bad output keeps `pnpm dev` working with zero configuration (the cold-start promise)
    without inventing a second, different "no parser configured" behaviour.
93. **A forced tool call (`tool_choice`), not free-text-then-parse — but the tool's `input` is
    still zod-validated, never trusted just because the API accepted the request.** Forcing a tool
    call constrains what shape the model _can_ return; it says nothing about whether a specific
    response actually satisfies every rule in that shape (e.g. `value` positive, per
    `validateMeasurement`'s own domain rule) — a model can call a tool with a schema-shaped but
    substantively wrong payload, and only re-validating catches that.
94. **New rule discovered, not created: a `HazardParser` test double for interface-layer tests must
    live in `application/testing/`, not be a real `infrastructure/` adapter (even a harmless one
    like `NullHazardParser`).** `interface-no-infrastructure` (packages/architecture) already
    enforced this generally — caught for real when `routes.test.ts` first imported
    `NullHazardParser` directly and `pnpm arch` failed. Fixed by adding
    `application/testing/stub-hazard-parser.ts`, the same role `InMemoryHazardRepository` already
    plays for `HazardRepository`.
95. **Fixed in passing: `turbo.json`'s `dev` task was missing `EXPO_ACCESS_TOKEN` from
    `passThroughEnv`, since M6.5.** Noticed while adding `ANTHROPIC_API_KEY` to the same list —
    Turborepo silently strips any env var not listed there (the exact failure mode AGENTS.md's own
    "Tooling gotchas" section already names), so a real `EXPO_ACCESS_TOKEN` set for local `pnpm dev`
    would have been silently dropped this whole time. Both variables now listed.

## Deviations and open items from M7.1

- **Not verified against the real Anthropic API — no `ANTHROPIC_API_KEY` exists in this dev
  environment.** `AnthropicHazardParser` is tested against a real local HTTP server standing in
  for Anthropic's Messages API (same philosophy as `ValhallaRoutingEngine`/`ExpoPushNotifier`), not
  the live endpoint. The request/response shapes are taken from Anthropic's own published API
  docs, not confirmed against a real call — get a key from console.anthropic.com and try a real
  transcript before trusting the model actually calls the tool reliably and picks sensible types.
- **`positionHint` is round-tripped by the parse endpoint but goes nowhere yet.** Nothing calls
  `POST /hazards/voice-reports/parse` and nothing threads its result into `POST /hazards/reports`
  — that's M7.3's job (the app-side confirm-then-file flow). `reportHazardRequestSchema`/
  `HazardReport` don't have a `positionHint` field at all yet; whether one's worth adding, or
  whether it just gets folded into `note` at submit time, is an open call for whoever builds M7.3.
- **No voice hazard report has ever actually been filed** — `source: 'voice'` has existed in the
  domain/contracts since before M7 (it was already there for M6's own tests), but nothing in this
  codebase has ever driven the real path from a transcript to a filed report. M7.2/M7.3 close this.
- **The system prompt and tool description are untested against real speech-to-text output** —
  they were written against clean, written-out example transcripts, not the kind of disfluent,
  half-sentence output on-device speech recognition actually produces from a driver talking while
  driving. Worth revisiting once M7.2 exists and real transcripts are available to test against.

**M7.2 delivered:** the driver-app half of design doc §7 steps 1–2 — the active-trip screen's mic
button is now real on-device speech capture, not a disabled placeholder. Deliberately stops at a
transcript: parsing it (M7.1's endpoint) and filing a report are M7.3's job, kept separate so this
task stays reviewable in one sitting and the capture mechanics get proven on their own first.

- **`expo-speech-recognition`** (new dependency, `57.1.0`, matching the installed Expo SDK) wraps
  iOS's `SFSpeechRecognizer` and Android's `SpeechRecognizer` — exactly the "iOS/Android native
  recognisers via an Expo module" the design doc names. Config plugin added to `app.config.ts`
  with `microphonePermission`/`speechRecognitionPermission` strings, matching `expo-location`'s
  own existing plugin-config shape.
- **`lib/voice-capture-reducer.ts`**: a pure state machine —
  `idle → starting → listening → transcribed | no-speech | error`, plus `permission-denied` — over
  events the hook below translates from native ones. Unit-tested directly with plain event
  objects, no native mocking needed, the same value a pure function always has in this codebase.
- **`lib/voice-report-permission.ts`**: `obtainVoiceCapturePermission`, structurally almost
  identical to `obtainPushToken` (M6.6) — check the existing permission, request if not granted, a
  denial is a value (`{ ok: false, reason: 'denied' }`), not a thrown error.
- **`hooks/use-voice-report-capture.ts`**: the thin glue — wires `ExpoSpeechRecognitionModule`'s
  real `start`/`result`/`end`/`error` events (via `useSpeechRecognitionEvent`) and
  `fetchCurrentLocation` (already built, M5.4) into the reducer through `useReducer`. `start()`
  requests permission and the current GPS position concurrently, then calls the native module's
  own `start()` with `continuous: false, interimResults: false` (hands-free — nothing partial to
  read on screen while driving); `cancel()` calls `abort()` then resets, so `starting`/`listening`
  is never a dead end for a driver who changes their mind.
- **`app/active-trip.tsx`**: the mic button is wired for real — tapping while idle/transcribed/
  no-speech/error/permission-denied starts a new capture, tapping while starting/listening cancels
  it. A transcribed result shows "Heard: '…' — filing this report is coming soon" rather than
  doing anything with it yet.

17 new driver-app tests (`voice-capture-reducer.test.ts`'s 13, `voice-report-permission.test.ts`'s
4). 144 driver-app tests total (up from 127). `pnpm arch` clean (355 modules, 1225 dependencies).
`pnpm verify` green end to end. No component-level test for `active-trip.tsx` itself, matching
this app's existing convention (no screen has ever had one).

**Verified as far as it can be without a real device or dev build** — same boundary every prior
driver-app milestone touching a native module has hit (M6.6's push registration, M5.10's own
pending item). `expo-speech-recognition`'s native module has never actually run: covered by the
reducer's and permission helper's unit tests plus a clean typecheck/lint/`pnpm arch` run, not a
real microphone. Revisit once M5.10 unblocks a real device — that's also when the design doc's own
open question (real-world accent/cab-noise accuracy) finally gets a real answer, per this
session's decision when M7 planning started.

## Decisions from M7.2

96. **M7.2 stops at a transcript — no parse call, no filing.** The reducer's terminal
    `transcribed` state carries the transcript and the GPS origin captured at recording start, and
    nothing else happens to it. Splitting capture from parse-and-file (M7.3) keeps each task
    independently reviewable and lets the capture mechanics (permissions, native event handling)
    get proven before building UI on top of a result that might not be reliably shaped yet.
97. **Voice capture is modelled as a pure reducer over injected native events, not a single async
    function like `obtainPushToken`.** A capture session is inherently a sequence of events
    (start/result/error/end) arriving over time from the native module, not one call-and-response
    — `voiceCaptureReducer` is the "pure logic" half of the same split `push-registration.ts`
    established, just shaped to fit what this port actually looks like.
98. **A trailing `no-speech`/`end` signal only applies while `starting`/`listening`; every other
    state (`transcribed`, `error`, `permission-denied`) ignores it.** Caught while writing the
    reducer's own tests, not from a real device: the native module's `end` event fires after
    _every_ session, including ones that already got a final result or already errored, and a
    naive reducer would let that trailing signal silently clobber whichever real outcome arrived
    first.
99. **`cancel()` calls `ExpoSpeechRecognitionModule.abort()` then resets, and is reachable by
    tapping the mic button again while `starting`/`listening`.** Without it, a driver who taps the
    mic and changes their mind — or a recognizer that never reaches a natural end — would have no
    way back to `idle` until the native module decided to fire its own `end`/`error` event on its
    own schedule.
100.  **GPS origin capture is best-effort, not blocking.** A denied location permission or a failed
      fix doesn't stop voice capture from proceeding — `origin` just stays `undefined`, mirroring
      `report-hazard.tsx`'s own `effectivePin ?? location.point` fallback for the tap flow. M7.3's
      filing step will need the same fallback for whichever transcript arrives with no origin.

## Deviations and open items from M7.2

- **Not verified on a real device — no dev build or EAS project exists yet (M5.10).** Everything
  native-module-shaped here (permission prompts, the recognizer actually hearing speech, platform
  differences between iOS's `SFSpeechRecognizer` and Android's `SpeechRecognizer`) is unverified
  beyond a clean typecheck/lint and the pure logic's own unit tests. This is also what blocks the
  design doc's own "test real accents/cab noise cheaply" open question from getting a real answer.
- **No mid-capture "stop and use what you've got so far" action** — only start and full cancel.
  `continuous: false` + `interimResults: false` means the module itself has no partial result to
  finalize early, so this isn't a missing feature so much as a property of the chosen recognition
  mode; revisit if `interimResults: true` ever becomes worth the added complexity of streaming
  partial text.
- **The transcript is shown but never used** — M7.3 is where it gets sent to M7.1's parse endpoint,
  spoken back for confirmation, and (only on a yes) filed as a real `source: 'voice'` report.
- **No Bluetooth/steering-wheel media-button trigger.** Assessed and deliberately skipped for this
  task: `expo-speech-recognition` has no hook into hardware media-button events, and wiring one up
  would mean a second native integration (likely `react-native-track-player`-style media-session
  hooks, or a custom native module) — genuinely complicated, not "easy," so per this session's own
  M7-planning decision it's deferred rather than trialled now.

**M7.3 delivered:** design doc §7 steps 3-4 end to end — the driver-app half of voice reporting is
now a complete flow, not just capture. Tapping the mic captures a transcript (M7.2), sends it to
M7.1's parse endpoint, speaks a summary back, listens for a yes/no reply, then either files a real
`source: 'voice'` hazard report or saves an unconfirmed draft — never both, never neither.

- **`lib/voice-report-flow-reducer.ts`**: a pure state machine —
  `idle → capturing-report → parsing → speaking-summary → capturing-confirmation → filing → filed
| queued`, with `report-no-speech`, `draft-saved` and `error` as the other resting states. Fully
  unit-tested (18 cases) with no native mocking. `confirmation-yes`'s event carries an already-
  resolved `origin: MapPoint` (not optional) — the hook decides whether there's anywhere to put
  the pin _before_ dispatching, so the reducer itself never has to reason about "yes, but no
  location," keeping it simpler than the first draft of this file (see decision 102, below).
- **`lib/voice-report-summary.ts`**: builds the exact spoken summary design doc §7 step 4 gives as
  an example ("Low bridge, about 3.5 metres, here — save it?"), reusing `HAZARD_TYPE_LABELS` so
  voice and tap reporting always describe hazard types in the same plain words.
- **`lib/yes-no-parser.ts`**: a short, hard-coded word list (no second LLM round trip needed for a
  binary decision), word-boundary matched — a naive substring check would have read "I **know**
  where that is" as a "no" (caught by the tests, not by inspection: `know` contains `no`).
- **`hooks/use-voice-hazard-report-flow.ts`**: the orchestration — wraps `useVoiceReportCapture`
  (M7.2) and runs it a _second_ time for the confirmation reply, reusing its `no-speech` outcome
  as design doc §7 step 4's own "no answer within a few seconds" timeout, with no separate timer
  needed. `expo-speech`'s `Speech.speak()` drives the spoken summary; `onError` still dispatches
  `speech-done` (fails open — a broken TTS voice shouldn't also block listening for a reply).
  Filing reuses `report-hazard.tsx`'s exact offline-first path (`enqueueHazardReport` before ever
  touching the network, `useReportHazard`, left queued on failure for `useHazardQueueFlush` to
  retry) — voice and tap reports share the same durability guarantee.
- **`db/voice-draft-queue.ts`**: a new, separate local sqlite table (`voice_hazard_drafts`) for
  unconfirmed reports — deliberately not the same table `hazard-queue.ts` already auto-retries,
  since a draft has never been confirmed and must never be sent automatically. Stores the
  transcript, the parsed result and the origin captured (if any); M7.4 is the screen that will
  read, edit/discard or file these.
- **`app/active-trip.tsx`**: the mic button now drives the whole flow — tap to start, tap to
  cancel while listening (either capture session), disabled while working (parsing/speaking/
  filing), with the summary spoken back also shown on screen and a final status line ("Saved." /
  "Saved — this will be sent automatically once you're back online." / "Not filed — saved as a
  draft to review when you're parked.").

46 new driver-app tests (`voice-report-flow-reducer.test.ts`'s 18, `voice-report-summary.test.ts`'s
4, `yes-no-parser.test.ts`'s 3, `db/voice-draft-queue.test.ts`'s 5, plus `api/hazards.test.ts`
gaining 2 for `parseVoiceHazardReport`). 190 driver-app tests total (up from 144). `pnpm arch`
clean (365 modules, 1245 dependencies). `pnpm verify` green end to end. The orchestration hook
itself has no test of its own, matching this codebase's established convention (M6.6 decision 87's
own reasoning, restated by M7.2): a thin hook's job is fully covered once the pure functions
underneath it are, and no screen/hook in this app has ever had a component-level test.

## Decisions from M7.3

101. **An explicit "no", an unclear reply, a confirmation-capture failure, a timed-out silence,
     and a clear "yes" with nowhere to resolve a location are all the same outcome: an unconfirmed
     draft, never a lost report.** AGENTS.md's own safety rule ("Voice reports are never filed
     publicly without driver confirmation") only names the _positive_ case explicitly; this
     extends the same care to every negative one — a misheard "no" costs the driver nothing (the
     draft is still there to review when parked), where silently discarding a report they tried to
     make would.
102. **The reducer never sees `undefined` as a location — the hook resolves `origin ?? fallbackOrigin`
     before dispatching `confirmation-yes`, and dispatches `confirmation-declined` instead if
     neither exists.** An earlier draft had the reducer itself branch on "yes, but no origin" and
     route to `draft-saved` — moved into the hook once it became clear the _fallback_ (the live
     position `active-trip.tsx` already tracks) is itself a hook-level concern the reducer has no
     business knowing about; the reducer is simpler for treating "yes" as always having somewhere
     to file.
103. **The confirmation reply reuses `useVoiceReportCapture` a second time, rather than a separate,
     simpler "just listen for one word" mechanism.** The capture hook's own `no-speech`/`error`/
     `permission-denied` states already mean exactly what's needed here (a timeout, a mic fault, a
     revoked permission) — building a second, parallel listening mechanism would duplicate that
     for no benefit; the orchestration hook just has to track _which_ semantic phase a given
     capture session belongs to (report vs. confirmation), which it already needs regardless.
104. **Unconfirmed drafts live in their own sqlite table (`voice_hazard_drafts`), never
     `hazard_queue`.** The two tables look similar (id/payload/created_at) but mean opposite
     things: a `hazard_queue` row is _confirmed_, waiting only on connectivity, and
     `useHazardQueueFlush` sends it automatically the moment it can; a `voice_hazard_drafts` row
     has never been confirmed and must never be auto-sent — reusing one table for both would risk
     a drafts-review feature (M7.4) accidentally filing something a driver said "no" to, or the
     auto-flush accidentally sending an unconfirmed draft.
105. **`Speech.speak()`'s `onError` still advances the flow to listening for a reply, rather than
     surfacing an error.** A broken or missing TTS voice on some device is a real possibility this
     codebase has no way to test for locally; failing open (proceed to listening, just without the
     spoken confirmation actually being heard) keeps the flow usable — worse than a silent
     confirmation is a flow that gets stuck because narration itself failed.

## Deviations and open items from M7.3

- **Not verified on a real device, same gap as M7.2** — everything here is covered by the pure
  reducer/parser/summary unit tests plus a clean typecheck/lint/`pnpm arch` run, not a real
  microphone, a real TTS voice, or a real yes/no spoken back to a phone. This PR also carries the
  first real EAS development build + Android project setup (M5.10) attempted alongside it — see
  the README/M5.10 update once that build's outcome (and, ideally, a real device confirming this
  flow) is known.
- **The yes/no word list is English-only and untuned against real speech-to-text output** — same
  caveat M7.1's system prompt and M7.2's own capture code already carry: written against clean,
  typed-out phrasing, not the disfluent output a real recognizer produces from a driver's actual
  voice.
- **No test proves the two-table split (decision 104) end to end** — `db/voice-draft-queue.test.ts`
  and `db/hazard-queue.test.ts` each prove their own table works in isolation; nothing yet asserts
  that a declined voice report never appears in `hazard_queue`, or that `useHazardQueueFlush`
  never touches `voice_hazard_drafts`. Low risk (the code paths are entirely separate, never
  sharing a table name), but worth a dedicated test if M7.4 ever finds the two interacting
  unexpectedly.
- **M7.4 (the drafts review screen) landed the same session** — see below; this deviation is
  resolved.

**M7.4 delivered:** `app/voice-drafts.tsx` — the screen M7.3 built the storage layer for but left
unread. Reachable from `home.tsx` ("Saved reports"), it lists every `voice_hazard_drafts` row and
lets a driver, now parked, either file it for real or discard it.

- **`lib/voice-draft-to-report.ts`**: `reportRequestForDraft(draft, id, origin)` — a pure mapping
  from a saved draft to a real `ReportHazardRequest`, taking `id` and `origin` as arguments rather
  than generating them internally (a fresh UUID is an effectful `expo-crypto` call; `origin` may
  need the driver's current position as a fallback) so the mapping itself stays directly testable.
- **`api/use-voice-drafts.ts`**: `useVoiceDrafts` (a `useQuery` over `listVoiceHazardDrafts` — same
  shape as every remote list in this app, even though this one reads local SQLite, so the screen
  doesn't need a different pattern just because the data happens to be on-device),
  `useDiscardVoiceDraft`, and `useFileVoiceDraft`. Filing reuses the exact offline-first sequence
  every other report in this app follows — `enqueueHazardReport` before the network call — and
  removes the draft row once _enqueued_, not once _sent_: from that point the report is confirmed,
  and `useHazardQueueFlush` (decision 104's separate table) owns getting it there if the immediate
  send fails.
- **`app/voice-drafts.tsx`**: each row shows the hazard type, measurement, spoken position hint,
  the raw transcript (so a driver can judge whether the parse looked right before trusting it) and
  when it was captured, with "Report it" / "Discard" actions. A draft with no captured origin (GPS
  unavailable when recording started) falls back to the driver's current position
  (`useCurrentLocation`, reasonable here since this is explicitly a parked-use screen) — if that's
  also unavailable, "Report it" is disabled with a hint rather than silently failing.

7 new driver-app tests (`voice-draft-to-report.test.ts`). 193 driver-app tests total (up from 190).
`pnpm arch` clean (369 modules, 1264 dependencies). `pnpm verify` green end to end across the whole
monorepo.

**Verified as far as it can be without a real device** — same boundary every driver-app milestone
touching native storage/location has hit. `voice-draft-to-report.ts`'s mapping is unit-tested
directly; `use-voice-drafts.ts`'s hooks and the screen itself follow this app's existing
convention of no component-level test, covered instead by a clean typecheck/lint/`pnpm arch` run.

## Decisions from M7.4

106. **A draft's own captured origin is preferred over the driver's live position, but the live
     position is a real fallback, not just a UI hint.** `reportRequestForDraft` always takes
     whatever origin the caller resolves and never reaches for `useCurrentLocation` itself — the
     screen resolves `draft.origin ?? location.point` before calling it, keeping the pure function
     ignorant of where a location ultimately came from, the same separation of concerns M7.3's
     decision 102 established for the live confirm flow.
107. **Filing from the drafts screen removes the draft row as soon as the report is _enqueued_,
     not once it's confirmed _sent_.** Waiting for a successful network response before removing
     the draft would mean a driver who reports from a draft while still offline sees it vanish
     from "saved reports" only to silently reappear if they refresh before connectivity returns
     — worse, it would leave the _same_ report sitting in both `voice_hazard_drafts` and
     `hazard_queue` at once, which decision 104 specifically exists to prevent. Once enqueued, the
     report is confirmed and belongs entirely to `hazard_queue`'s own retry story.

## Deviations and open items from M7.4

- **No editing.** A driver can file a draft as-is or discard it, but can't correct a misheard type
  or measurement before filing — design doc §7 doesn't ask for this explicitly ("review later when
  parked" implies looking it over, not necessarily editing it), and the tap-to-drop screen already
  exists as the fallback for "the voice parse got this wrong, let me just redo it properly." Worth
  revisiting if testers find themselves discarding-then-re-reporting by hand often.
- **Not verified on a real device** — same gap as M7.1-M7.3. `voice-drafts.tsx` has never actually
  displayed a real saved draft on a real phone, filed one for real, or exercised the "no location
  available, button disabled" branch against a real GPS-off phone.
- **This closes M7's own task breakdown** (M7.1-M7.4 all done) — voice reporting is now a complete
  feature end to end in code, pending the same real-device verification every M7 task has deferred.
  Real-world accent/cab-noise testing (the design doc's own open question) remains the single
  biggest unknown, unaddressed by anything unit tests can cover.
