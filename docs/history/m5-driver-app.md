# M5 Driver app

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

## M5 task breakdown

The user decided to design for both iOS and Android from the start (resolves the "iOS, Android or
both?" open question, above), so there's no platform-scoping decision left to make before M5
starts.

| #     | Task                                                                                                                 | Status            |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| M5.1  | `apps/driver-app` skeleton — Expo + Expo Router + TS, EAS config for both platforms, points at driver-bff via config | Done — 2026-09-22 |
| M5.2  | Auth — sign-in screen, secure token storage, TanStack Query client, opportunistic refresh                            | Done — 2026-09-23 |
| M5.3  | Vehicle profiles screens                                                                                             | Done — 2026-09-23 |
| M5.4  | Plan route screen (MapLibre)                                                                                         | Done — 2026-09-23 |
| M5.5  | Route overview screen                                                                                                | Done — 2026-09-23 |
| M5.6  | Active trip screen (no voice/reroute yet — M6/M7)                                                                    | Done — 2026-09-23 |
| M5.7  | Report hazard (tap) + hazard detail                                                                                  | Done — 2026-09-23 |
| M5.8  | Offline hazard queue (expo-sqlite)                                                                                   | Done — 2026-09-23 |
| M5.9  | Feedback screen                                                                                                      | Done — 2026-09-23 |
| M5.10 | Real-device/simulator verification both platforms; EAS Build → TestFlight + Play internal                            | In progress       |

**M5.10 in progress:** real-device verification on Android done — the app (including the M7
voice flow) was run on a physical Android phone via Expo Go/dev client on 2026-09-25 and works.
iOS real-device verification and the EAS Build → TestFlight + Play internal step are both still
open; the latter is blocked on the Apple/Google Play developer accounts (Expo's own EAS account
is already set up).

**M5.1 delivered:** `apps/driver-app` exists as a real Expo project — not just a plan for one —
scaffolded from Expo's own SDK 57 template and cut down to a genuine skeleton (one screen, no
demo/tab/web boilerplate), matching M1.3's own "boots and answers /health" standard: the one
screen shows the product name and a live reachability check against the driver BFF's `/health`.

- **Scaffolded via `create-expo-app` (the "default"/tabs SDK-57 template), then stripped hard**:
  deleted the demo tab screen, animated-icon/glass-effect/app-tabs components, all web support
  (`react-native-web`, the `web` app.json key, `.web.tsx` variants — the design doc's distribution
  story is TestFlight + Play, never web), `react-native-reanimated`/`worklets` (nothing here
  animates yet), and the template's own `.claude/settings.json` (enabled an unrelated Expo Claude
  plugin — this repo already has its own AGENTS.md-driven conventions). Kept only what a real
  skeleton needs: `expo-router`'s peer deps (`gesture-handler`, `safe-area-context`, `screens`),
  `expo-constants`/`expo-linking`/`expo-splash-screen`/`expo-status-bar`/`expo-system-ui`.
- **`src/product.js` (deliberately `.js`, not `.ts`)** holds the one `PRODUCT_NAME` constant
  AGENTS.md asks for ("keep the product name in one config constant"), imported by both
  `app.config.ts` (the native app name) and in-app UI text. Found by actually running
  `expo export`, not assumed: Expo's config loader transpiles only `app.config.ts` itself, not any
  TypeScript file it imports — a sibling `product.ts` failed to resolve under plain `require`
  once evaluated. A plain `.js` file needs no transpilation, so it resolves from both sides
  (`expo/tsconfig.base`'s `allowJs` covers the TS-side import).
- **`app.config.ts` replaces `app.json`** (dynamic config, specifically so it can import
  `PRODUCT_NAME`), sets real `bundleIdentifier`/`package` (`com.wagonwise.driverapp`), and drops
  the template's iOS "Icon Composer" bundle (`.icon`, bleeding-edge, adds an SVG+grid asset
  bundle) for a plain `icon.png` shared with Android — simpler, revisit once there's real
  branding.
- **`src/config.ts`**: the one place this app reads `process.env` (mirrors
  `apps/core/src/config.ts`'s rule), resolving the driver BFF's URL — `10.0.2.2` on the Android
  emulator (its documented alias for the host's own `localhost`), plain `localhost` on the iOS
  simulator (shares the host's network namespace), overridable via `EXPO_PUBLIC_BFF_URL` for a
  physical device on the LAN. Actual logic worth testing, so it got a real test file
  (`config.test.ts`, 3 cases) rather than being left as an assumption — matches AGENTS.md's "write
  tests alongside every use case."
- **Deliberately deferred, not forgotten**: no TanStack Query or Zustand yet (design doc's stack
  for this app) — nothing here has real server or UI state to manage before M5.2's auth screen
  exists; wiring either now would be the same "port before it has a caller" mistake M2.3 avoided,
  applied to a dependency instead of a port. No `@wagonwise/contracts` dependency yet either — the
  only network call so far is an unshaped `/health` ping, not a contract-shaped request.
- **Tooling deviations, decided and recorded rather than forced to match core/driver-bff**:
  `tsconfig.json` extends `expo/tsconfig.base`, not `@wagonwise/config/tsconfig.base.json` — the
  shared base sets `module`/`moduleResolution: NodeNext` (needs `.js`-suffixed relative imports),
  which fights Metro's bundler-style resolution; RN code here is bundled by Metro, never run by
  plain `node`. Same reasoning for `eslint.config.js`: Expo's own `eslint-config-expo/flat`, not
  `@wagonwise/config/eslint` — the "well-understood official preset" is the boring choice, same as
  M4.1's reasoning for using `jose` over hand-rolling JWKS handling. `tsconfig.json` also needed an
  explicit `"types": ["jest"]` — TS's automatic `@types` inclusion didn't pick up `@types/jest`
  under `expo/tsconfig.base`'s settings without it, confirmed by hitting real "cannot find name
  'describe'" errors, not guessed in advance.
- **`eas.json`**: `development`/`preview`/`production` build profiles for both platforms. Not yet
  linked to a real Expo account/project — `eas login`/`eas init` are one-time interactive steps
  only the user can do (this session can't authenticate as them). Genuinely deferred to M5.10, not
  forgotten.
- **`turbo.json`'s `dev` task gains `EXPO_PUBLIC_BFF_URL`** in `passThroughEnv` — the exact
  documented gotcha in AGENTS.md's Tooling section, applied before it could bite rather than after.
- **Found and fixed a real, pre-existing bug while running `pnpm verify`, unrelated to this
  task**: `apps/driver-bff/src/core-client.ts`'s `responseBody` was an implicit `any` from
  `response.json()`, flagged by `@typescript-eslint/no-unsafe-assignment` — a real lint violation
  from M4.4 that had simply never been re-linted since (Turborepo's lint cache replays a passing
  result until something invalidates it; adding `apps/driver-app`'s dependencies changed
  `pnpm-lock.yaml`, which did). Fixed with an explicit `unknown` annotation on the `const`, the
  rule's own documented escape hatch — one line, no behaviour change.
- **`pnpm-workspace.yaml`'s `allowBuilds`** gains `@parcel/watcher` (Metro's native file watcher)
  and `unrs-resolver` (a transitive dependency of `eslint-config-expo`'s import resolution),
  both legitimate native binaries from reputable ecosystems, approved the same way M1.1's
  `esbuild` was.
- **Two real dependency-version mistakes caught by actually running the tooling, not assumed
  correct from `create-expo-app`'s scaffold**: `expo-router` needs `expo-constants` as a peer
  dependency (missing after the trim-down; `expo-doctor` caught it as a real crash risk, not a
  lint nicety) and the scaffold's own `jest@^30`/`@types/jest@^30` are newer than SDK 57's
  `jest-expo` actually expects (`~29.7.0`/`29.5.14`) — `expo-doctor` flagged both as version
  mismatches. Fixed by installing the missing peer and pinning the two test-tooling versions down
  to what the SDK expects; `expo-doctor` now reports 21/21 checks passing.

409 core tests (unchanged), 56 driver-bff, 17 architecture, 33 contracts, plus **3 new driver-app
tests** (`config.test.ts`) — the first tests in `apps/driver-app`. `pnpm arch` clean (203 modules,
686 dependencies — the architecture rules already scan `apps/driver-app/src` automatically, same
`check.mjs` discovery M1.6 confirmed for driver-bff, no config change needed). `pnpm verify` clean
end to end across all six packages.

**Verified by actually running the tooling, with a real and disclosed gap**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` reports 21/21; `npx
expo export --platform android` and `--platform ios` both produce a real Hermes-compiled bundle
(1250 and 1105 modules resolved respectively) — proof every import genuinely resolves and Metro
can genuinely bundle for both platforms, the same "prove the mechanism, not just that a process
starts" standard M2.1 set for Valhalla. **Not verified: an actual running app.** This machine has
no Android SDK/emulator and no macOS (the design doc's own note: iOS needs a Mac or Expo Go), so
nothing here has been driven by a real simulator, a physical device via Expo Go, or a screenshot —
worth doing before trusting `src/config.ts`'s platform-detection logic beyond what its unit tests
cover. `git status`/`git add -n` confirmed exactly the intended file set is tracked (no
`node_modules`, `.expo/`, or `expo export` scratch output).

## Decisions from M5.1

- **`apps/driver-app` deliberately does not reuse `@wagonwise/config`'s tsconfig/eslint presets.**
  Recorded above, in the "delivered" notes — the first time a package in this monorepo has needed
  its own tooling base rather than the shared one, because it's the first package Metro bundles
  instead of `tsc`/`node` running.
- **The product's display name lives in a `.js` file, not a `.ts` one, specifically so
  `app.config.ts` can import it.** Also recorded above — a real Expo config-loader constraint
  found by running `expo export`, not a style preference.

**M5.2 delivered:** a real sign-in flow — OTP over email/phone plus an invite code on first
sign-in, a persisted session, and proactive token refresh — reachable end to end through the BFF,
matching the design doc's own wording ("the app refreshes its access token opportunistically,
never only on a 401").

- **`src/api/identity.ts`**: thin fetch wrappers for `otp/request`, `otp/verify`,
  `token/refresh`, parsing every response through `@wagonwise/contracts/identity`'s own zod
  schemas (AGENTS.md rule 11 — no hand-written duplicate types) and throwing a single
  `IdentityApiError { tag, status, attemptsRemaining? }` on any non-200, so screens have one
  thing to catch rather than a different shape per route.
- **`src/state/auth-store.ts`** (Zustand): a three-state union (`restoring` / `signedOut` /
  `signedIn`), not booleans plus optional fields — a driver is never "half signed in." Persists
  only the refresh token and driver info to `expo-secure-store`; the access token is **never**
  persisted, deliberately — `restore()` exchanges the stored refresh token for a fresh access
  token on every cold start rather than trusting a stale one to still be valid, and rotates the
  persisted refresh token immediately (decision 33: reuse of a rotated-away token revokes the
  whole session, so the persisted copy must always be the current one). A dead/reused refresh
  token on restore clears storage and goes to `signedOut` rather than leaving the app stuck on a
  loading spinner forever.
- **`src/hooks/use-opportunistic-refresh.ts`** schedules a refresh ahead of the access token's
  real expiry (read via `src/lib/jwt.ts`'s `accessTokenExpiryMs`, decode-only — this app has no
  key to verify a signature with, only core and the BFF do, decision 1) and re-checks on every
  `AppState` transition to `active`, covering the case where the scheduled JS timer never fired
  because the app was suspended in the background. The actual scheduling arithmetic lives in
  `src/lib/refresh-schedule.ts` as two pure functions (`refreshDelayMs`, `shouldRefreshOnResume`),
  tested directly with no timers, no `AppState` mock, no rendered hook — the hook itself is thin
  glue, verified by design over the tested pure core the same way M2.3/M2.4 verified a port/pure-
  function pair before either had a caller to run against.
- **`src/app/sign-in.tsx`**: two-step screen (identifier + optional invite code → code), 56px+
  tap targets, high-contrast dark theme, plain UK-English error copy per tag (`OtpIncorrect` shows
  the real `attemptsRemaining` count). The invite code is captured once on step one and carried
  forward silently to `verifyOtp` on step two — both `otp/request` and `otp/verify` need it on a
  genuinely new identifier (confirmed by reading `request-otp.ts`/`verify-otp.ts`: the code is
  validated-but-not-redeemed at request time, redeemed atomically with creating the `Driver` at
  verify time), so asking the driver to type it twice would be a real UX bug, not just untidy.
- **`src/app/index.tsx` is a redirect gate, not a screen** — shows a spinner while `restore()`
  settles, then `<Redirect>`s to `/sign-in` or `/home`. `src/app/home.tsx` is a deliberate
  placeholder (identifier + sign-out button, nothing else) — real screens are M5.3+; its only job
  here is proving the sign-in flow actually reaches a signed-in area.
- **Two real Jest/ESM tooling problems, found by running the test suite, not anticipated**:
  `@wagonwise/contracts`'s `package.json` `exports` only had `types`/`import` conditions; Jest's
  default resolver doesn't request `import`, so `@wagonwise/contracts/identity` came back
  "cannot find module" even though Metro resolves it fine. Fixed by adding a `"default"`
  condition alongside `"import"` for every subpath (Node's own documented fallback condition,
  not a workaround). Separately, `jose` (also used for JWT decode, decision 39's precedent —
  hand-rolling a signed-token library would be the actual workaround) ships ESM-only with no CJS
  build at all; Jest's default `transformIgnorePatterns` skips transpiling it since it isn't on
  jest-expo's react-native/expo allow-list, so `require`-ing it hit a raw
  `Cannot use import statement outside a module`. Fixed by extending (not replacing)
  jest-expo's default pattern in `apps/driver-app/jest.config.js` to also transpile `jose`.
- **No `@wagonwise/contracts` change needed for `hazards`/`routing`'s own exports** — only
  `identity`'s subpath is consumed from `apps/driver-app` so far; the same `"default"` condition
  was still added to all three for consistency, since the next module M5.3+ needs will hit the
  identical Jest resolution gap otherwise.

402 core tests (unchanged), 56 driver-bff (unchanged), 17 architecture, 33 contracts, and
**27 driver-app tests** (up from 3 at M5.1 — `identity.test.ts`, `jwt.test.ts`,
`refresh-schedule.test.ts`, `auth-store.test.ts`, plus the existing `config.test.ts`). `pnpm arch`
clean (219 modules, 723 dependencies). `pnpm verify` clean end to end across all six packages.

**Verified the same way as M5.1, with the same disclosed gap**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` 21/21; `npx expo export
--platform android` and `--platform ios` both produce a real Hermes bundle (1456/1105+ modules —
up from M5.1's count, confirming the new auth/query/secure-store code and `@wagonwise/contracts`
import genuinely resolve and bundle, not just typecheck). `packages/contracts`'s own typecheck and
`vitest run` re-confirmed unaffected by the `exports` change. **Still not verified: an actual
running app** — same hardware gap as M5.1 (no Android SDK, no macOS). The sign-in flow has never
been driven against a real running core + BFF with a real OTP code; worth doing before trusting it
beyond what the mocked-fetch unit tests cover.

## Decisions from M5.2

- **The access token is never persisted, only the refresh token.** Recorded above — cold start
  always re-derives a fresh access token via `token/refresh` rather than trusting a stored one,
  keeping exactly one code path (`restore()`) responsible for "how does this app get a valid
  access token," instead of two (restore-from-storage and refresh-when-expired) that could drift.
- **`packages/contracts`'s `exports` gained a `"default"` condition; `apps/driver-app`'s Jest
  config extends jest-expo's `transformIgnorePatterns` for `jose`.** Both recorded above — real
  tooling constraints found by running the test suite, not assumptions.

**M5.3 delivered:** vehicle profile CRUD — list, create, edit, delete — reachable end to end
through the BFF's `/routing/vehicle-profiles` routes, the design doc's screen table's "large
number inputs, metres and tonnes with feet/inches shown alongside height."

- **`src/api/http.ts`**: a shared `requestJson(method, path, options)` + `throwUnlessSuccess`,
  factored out of M5.2's `identity.ts` once `routing.ts` needed the identical pattern with two
  differences identity never had — `GET`/`PUT`/`DELETE`, and an `Authorization` header. Same
  "one method covering every verb" reasoning as the BFF's own `core-client.ts` (M4.4).
  `src/api/errors.ts`'s `IdentityApiError` renamed to `ApiError` in the same change — the error
  shape (`{ tag, status, attemptsRemaining? }`) is identical across every module, and a screen
  only ever needs `error.tag`, never which module produced it.
- **`src/api/routing.ts`**: thin wrappers for all five vehicle-profile routes, parsing every
  response through `@wagonwise/contracts/routing`'s own schemas (rule 11, same as identity.ts).
  `updateVehicleProfile` reuses `createVehicleProfileRequestSchema` rather than importing
  `updateVehicleProfileRequestSchema` — the two are structurally identical in
  `packages/contracts/src/routing.ts`, so importing both would just parse the same shape twice.
- **`src/lib/vehicle-profile-form.ts`**: pure parse/validate/format functions, no React — the
  same hook/pure-function split M5.2's `use-opportunistic-refresh.ts` established.
  `parseVehicleProfileForm` mirrors core's own `validateName`/`validateDimensions`
  (`routing/domain/vehicle-profile.ts`) exactly — a driver sees the same "must be a positive
  number" rejection before a network round trip, not a looser client-side rule the server would
  reject anyway (confirmed by reading the domain function, not guessed at).
- **`src/lib/units.ts`**: `formatHeightWithFeetInches`, height only — AGENTS.md's feet/inches
  rule is specifically about height (UK bridge signage), not width/length/weight, matching the
  design doc's own screen-table wording ("...with feet/inches shown alongside height"). Tested
  against AGENTS.md's own worked example (a 3.5m bridge) rather than an arbitrary number.
- **`src/components/vehicle-profile-form.tsx`**: one shared form for both create and edit — the
  first component this app has needed twice, so worth de-duplicating (matches M4.4's
  `src/testing/fakes.ts` precedent: extract on the _second_ real use, not speculatively on the
  first). Shows the driver's own validation message inline, clearing it as soon as a field
  changes, distinct from a server-side error from the last submit attempt (a stale "couldn't
  reach the server" message must not linger once the driver starts correcting a typo).
- **Vehicle profile screens use plain string route paths (`/profiles`, `/profiles/new`) and the
  object form for the dynamic one** (`{ pathname: '/profiles/[id]', params: { id } }`) — Expo
  Router's `experiments.typedRoutes` (already on since M5.1) generates static types for exactly
  this shape; confirmed by running `tsc --noEmit` clean, not assumed to typecheck.
- **A real, first-of-its-kind architecture-tooling gap, found by running `pnpm arch`, not
  anticipated**: `packages/architecture/dependency-cruiser.config.cjs`'s
  `enhancedResolveOptions.extensions` was `['.ts', '.js', '.json']` — no `.tsx` — because no file
  in the repo had ever imported a `.tsx` file from another `.tsx` file before (`profiles/new.tsx`
  and `profiles/[id].tsx` importing `components/vehicle-profile-form.tsx` are the first). Every
  other tool (`tsc`, Jest, Metro) resolved it fine; only dependency-cruiser's own resolver needed
  telling. Fixed by adding `.tsx` to the list — a one-line fix, but the kind AGENTS.md's "fail
  closed" convention exists to surface rather than silently mis-resolve.

51 driver-app tests (up from 27 at M5.2 — `routing.test.ts`, `units.test.ts`,
`vehicle-profile-form.test.ts`, `error-messages.test.ts`, plus a fix to `identity.test.ts`'s own
mock `Response` shape, which the `http.ts` refactor's `headers.get()` call exposed as incomplete).
402 core, 56 driver-bff, 17 architecture, 33 contracts. `pnpm arch` clean (233 modules, 757
dependencies, now genuinely resolving every `.tsx`-to-`.tsx` import). `pnpm verify` clean end to
end across all six packages.

**Verified the same way as M5.1/M5.2, with the same disclosed gap**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` 21/21; `npx expo export
--platform android` (1467 modules, up from M5.2's 1456 — confirming the new screens, components
and API code genuinely resolve and bundle) and `--platform ios` both produce a real Hermes bundle.
**Still not verified: an actual running app** — same hardware gap as M5.1/M5.2. The full create →
list → edit → delete flow has never been driven against a real running core + BFF with a real
signed-in driver; worth doing before trusting it beyond what the mocked-fetch unit tests cover.

## Decisions from M5.3

- **`ApiError` (renamed from `IdentityApiError`) and `requestJson`/`throwUnlessSuccess` are
  shared across every API module, not duplicated per module.** Recorded above — the error shape
  and HTTP plumbing are identical; only the schemas and endpoints differ.
- **`packages/architecture/dependency-cruiser.config.cjs` now resolves `.tsx`.** Recorded above —
  a real gap in shared tooling, not app-specific, so fixed at the source rather than worked around
  in `apps/driver-app` alone.

**M5.4 delivered:** the plan-route screen — a real MapLibre map, tap-to-drop origin/destination,
a vehicle-profile picker, and a genuine `POST /routing/route-plans` call through the BFF.

Two real gaps the design doc left open, asked before writing any code rather than guessed at
(matching M3.5's precedent for a genuine fork):

- **Tile provider: MapTiler**, chosen by the user over Stadia or self-hosting (design doc §6
  named both MapTiler and Stadia as candidates but never picked one). Needs a real account and
  API key — a one-time, interactive step only the user can do (this session can't create
  accounts). `EXPO_PUBLIC_MAPTILER_API_KEY` unset falls back to MapLibre's own free, keyless demo
  style (`src/lib/map-style.ts`) — the same "cold start needs no undocumented step" convention
  every other config value in this monorepo follows, so the screen renders a genuine map right
  now while a real key is pending, not a blank one.
- **Geocoding: deferred, not built.** The design doc's own screen table says "destination
  search," but never mentions geocoding at all — turning typed text into coordinates needs a
  provider (Nominatim, or bundled with MapTiler/Stadia's own API) that nobody had picked. Rather
  than add a new external dependency unilaterally, the user chose tap-to-drop on the map instead;
  text search is now an explicitly-scoped future task, not a silently-missing feature.

- **MapLibre's real v11 API, learned by reading its actual TypeScript source, not assumed from
  memory of the older Mapbox-lineage API** (`MapView`/`PointAnnotation`) this library forked
  from: the current package exports `Map`, `Camera`, `ViewAnnotation`, etc., as a rewritten,
  differently-shaped API (`onPress` gives `event.nativeEvent.lngLat: [lon, lat]`; markers are
  `<ViewAnnotation lngLat={...}>` wrapping a plain `View`, not a `PointAnnotation`). Confirmed
  against `node_modules/@maplibre/maplibre-react-native/src/**/*.tsx` directly before writing
  `src/components/route-map.tsx`, since guessing at a native library's prop names would only
  surface as a real crash on a device this session cannot test on.
- **`src/hooks/use-current-location.ts` is a TanStack Query hook, not a raw
  `useEffect`+`setState`** — found by actually running `pnpm lint`, not by design: a first draft
  using `useEffect(() => { request(); }, [request])` tripped `react-hooks/set-state-in-effect`
  (part of `eslint-config-expo`'s React Compiler rules) because the effect's call graph reached a
  `setState`, even after restructuring so the call happened only after an `await`. Rather than
  fight the linter, modelled it the same way every other network call in this app already is —
  `fetchCurrentLocation()` returns a `Result`-shaped value (`{ ok: true, point } | { ok: false,
reason }`), never throwing for an expected outcome like a permission denial (AGENTS.md rule 13,
  applied to a client-side "failure" for the first time in this app).
- **The plan-route screen absorbs none of M5.5's job.** A successful plan shows only
  distance/duration inline; the route line, hazards and avoided restrictions stay M5.5's "route
  overview" screen, matching M3.5's own restraint about not building a read nothing consumes yet.
- **A driver's own tapped origin permanently overrides the GPS default, never the other way
  round.** `effectiveOrigin = origin ?? location.point` — a location fix landing late (a real
  possibility; `getCurrentPositionAsync` can take a few seconds) must never silently replace a
  point the driver already chose by tapping the map.

**60 driver-app tests** (up from 51 at M5.3 — `map-style.test.ts`,
`use-current-location.test.ts`, plus `routing.test.ts` gaining `planRoute` coverage). 402 core, 56
driver-bff, 17 architecture, 33 contracts. `pnpm arch` clean (243 modules, 779 dependencies).
`pnpm verify` clean end to end across all six packages.

**Verified the same way as M5.1–M5.3, with a wider disclosed gap than usual**: `pnpm --filter
@wagonwise/driver-app run typecheck/lint/test` all pass; `npx expo-doctor` 21/21; `npx expo export
--platform android` (1554 modules, up from M5.3's 1467 — and the asset list now includes
MapLibre's own marker icon, confirming the library's JS genuinely resolves and bundles) and
`--platform ios` both produce a real Hermes bundle. **Not verified: an actual map render.**
MapLibre needs its own native module compiled (`expo prebuild` / EAS Build), which — unlike every
prior M5 task's gap — this machine cannot do at all, Android SDK or not, since even a from-source
native build needs Xcode or Android Studio's NDK toolchain neither of which is installed. Treat
`src/components/route-map.tsx` as verified against MapLibre's real API surface by careful reading,
not by a real run, until it's opened on an actual device or simulator.

## Decisions from M5.4

- **MapTiler for map tiles; tap-to-drop instead of geocoded destination search.** Both recorded
  above — real product decisions the design doc left open, asked of the user rather than guessed.
- **`use-current-location.ts` uses TanStack Query, not a raw effect.** Recorded above — a real
  lint rule caught a real anti-pattern before it shipped, not a style preference.

**M5.5 delivered:** the route-overview screen — a real route line drawn on the map, distance/
time, avoided-restrictions/hazards sections, and a deliberately disabled "Start trip" button.

- **`src/lib/polyline.ts`**: a hand-rolled polyline6 decoder (AGENTS.md rule 6 — the same
  "small, well-understood things" reasoning as `sha256Hex` and the BFF's `core-client.ts`),
  pinned to precision 1e6 specifically because `GeoLine` was pinned to polyline6 back in M2.3
  (decision 52) and never needs to handle any other encoding. Tested with two hand-verified
  single-point fixtures (worked out by hand from the algorithm's own bit-packing, not copied
  from a library) plus a round-trip test through a locally-defined encoder for realistic
  multi-byte deltas — the encoder lives only in the test file, kept deliberately separate from
  the shipped decoder so a shared bug between the two couldn't hide behind the round trip alone.
- **`src/state/current-route-plan-store.ts`**: a single ephemeral "current plan" slot, not a
  list keyed by id. Confirmed by actually checking core's `routes.ts` (via a background
  research pass) that no `GET /routing/route-plans/:id` endpoint exists — `docs/progress.md`'s
  own M2.5/M2.6 notes already say this is deliberate ("no RoutePlan lifecycle in Phase 1"), so
  building a keyed cache for a resource with no way to re-fetch it would be speculative
  plumbing. `/plan-route` and `/route-overview` are still two separate screens/files (matching
  the design doc's own screen table), just sharing this one slot instead of passing the whole
  `RoutePlanDto` through Expo Router's string-only navigation params.
- **`components/route-map.tsx` gained an optional `routeLine` prop and an optional (not
  required) `onMapPress`** — the overview screen shows a fixed, already-planned route with no
  tap-to-edit, unlike the plan-route screen. Verified against MapLibre's real `GeoJSONSource`/
  `Layer` API the same way M5.4 verified `Map`/`Camera`/`ViewAnnotation`: read directly from the
  installed package's TypeScript source, not assumed.
- **"Start trip" is a real UI element, shown per the design doc's own screen table, but
  genuinely disabled — not wired to a route that doesn't exist.** A background research pass
  confirmed there is no `active_trips` table, no `ActiveTrip` domain type, and no trip-start
  endpoint anywhere in `apps/core`/`apps/driver-bff`/`packages/contracts` — active-trip tracking
  is explicitly M6 (Alerts) territory, and the driver-facing screen for it is M5.6, next. Rather
  than couple this commit's typecheck to a screen that doesn't exist yet (`router.push('/active-
trip')` would fail `tsc --noEmit` once Expo Router's typed routes are actually generated — see
  the verification note below), the button stays visibly present but disabled with a "coming
  soon" note, matching this codebase's own precedent (decision 68) for showing a real gap
  honestly rather than faking a working feature.
- **A real gap in this session's own prior verification claims, found while building this
  task**: M5.3's and M5.4's progress notes both said "confirmed by running `tsc --noEmit`" for
  Expo Router's typed routes, but `.expo/types/router.d.ts` — the file that actually makes typed
  routes real — is generated only by `expo start` (confirmed empirically: it does **not** appear
  after `expo export`, and even under `expo start` it took roughly 30 seconds of Metro startup
  before appearing, with no client ever connecting). Neither M5.3 nor M5.4 had a dangling route
  reference, so `tsc --noEmit` happened to pass either way — but the claim that typed routes
  were being genuinely checked was not verified at the time, only assumed. Confirmed for real
  this time: running `expo start` long enough to generate real types, then `tsc --noEmit`,
  genuinely caught the dangling `/active-trip` reference before it was fixed.

**67 driver-app tests** (up from 60 at M5.4 — `polyline.test.ts`,
`current-route-plan-store.test.ts`). 402 core, 56 driver-bff, 17 architecture, 33 contracts.
`pnpm arch` clean (248 modules, 790 dependencies). `pnpm verify` clean end to end across all six
packages.

**Verified the same way as M5.1–M5.4, plus a genuine typed-routes check this time**: `pnpm
--filter @wagonwise/driver-app run typecheck/lint/test` all pass, the latter run only after
actually generating `.expo/types/router.d.ts` (via a real `expo start`, left running long enough
to finish, then stopped) rather than trusting a stale or absent types file; `npx expo-doctor`
21/21; `npx expo export --platform android` and `--platform ios` both produce a real Hermes
bundle. **Not verified: an actual map render with a real route line drawn on it** — same
hardware gap as M5.4 (no native build toolchain on this machine at all, not just no Android SDK).

## Decisions from M5.5

- **The route-overview screen reads a route plan from a small client-side store, never
  re-fetches one.** Recorded above — core genuinely has no endpoint to re-fetch from, confirmed
  by checking, not assumed.
- **"Start trip" ships visible but disabled, not wired to a nonexistent screen.** Recorded above
  — keeps this commit's typecheck honest rather than deferring a broken reference to M5.6.
- **`docs/progress.md`'s own M5.3/M5.4 verification claims about typed routes were only
  half-true — corrected here, not silently left wrong.** Recorded above: the mechanism is real,
  but neither prior task had actually generated the types file it claimed to be checking against.

**M5.6 delivered:** the active-trip screen — and, since M5.5 confirmed no `ActiveTrip` backend
existed anywhere, the backend to go with it: core domain, a migration, two endpoints, a BFF
proxy, and the driver-app screen, mirroring how `RoutePlan` was built end to end.

- **`routing/domain/active-trip.ts`**: `ActiveTrip { id, routePlanId, driverId, startedAt,
lastPosition?, endedAt? }` — `driverId` duplicated off the `RoutePlan` it started from, same
  reasoning `RoutePlan` itself uses for duplicating `driverId` off `VehicleProfile` (decision 49):
  a direct ownership check with no join. `lastPosition` stays unset for the whole of this task —
  writing it for real needs a position-update endpoint only M6's reroute alerts actually need
  (design doc §6), so it isn't built until it has a real caller (same "don't wire an unused
  dependency" precedent as M2.3's `RoutingEngine`).
- **`application/`**: `startTrip` (looks up the driver's own `RoutePlan`, rejects a second
  concurrent trip via `TripAlreadyActive`) and `endTrip` (sets `endedAt`; ending an already-ended
  trip re-succeeds rather than erroring, same "sign-out never fails for tapping it twice"
  reasoning as identity's `revokeSession`, M1.5). New error tags `RoutePlanNotFound`,
  `ActiveTripNotFound`, `TripAlreadyActive` (409) added to routing's one `statusFor()` table.
  `ActiveTripRepository` port + in-memory fake, matching `RoutePlanRepository`'s shape.
- **No domain-event emission** (`TripStarted`/`TripEnded` from the design doc's own event list) —
  matches existing precedent: `RoutePlanned` isn't wired either, since nothing subscribes to
  either until M6 has a real handler. Not an oversight; the same "wire it when it has a caller"
  rule M2.3 and M5.5 both already apply.
- **`infrastructure/postgres-active-trip-repository.ts`** + **migration `0006_active_trips.sql`**:
  raw `sql` tagged templates (decision 26), same shape as `PostgresRoutePlanRepository`. The
  application layer's own `TripAlreadyActive` check is check-then-insert and therefore racy under
  two concurrent start requests — the same kind of gap M1.5's invite-code redemption race left
  open as a thrown exception (M1.5 deviations). Closed for real here instead, since it was nearly
  free: a partial unique index (`driver_id where ended_at is null`) makes a concurrent second
  insert violate a constraint and 500 rather than silently creating two active trips.
- **Two new routes**: `POST /routing/route-plans/:id/trip` (start, 201), `POST
/routing/trips/:id/end` (end, 200) — same `requireDriverId`/zod-param/`statusFor()` shape as
  every other routing route. Wired into `routing/api.ts`.
- **`packages/contracts/src/routing.ts`**: `activeTripSchema`, `routePlanIdParamsSchema`,
  `activeTripIdParamsSchema` — `lastPosition`/`endedAt` both `.optional()`, matching the domain.
- **`apps/driver-bff/src/routing-routes.ts`**: two proxy routes, same forward-and-relay shape as
  every other routing route (AGENTS.md rule 10 — no body to validate, since both take their id
  from the URL and their driver from the token).
- **driver-app**: `api/routing.ts` gained `startTrip`/`endTrip`; `api/use-active-trip.ts` wraps
  them as TanStack mutations (actions, not fetches — same reasoning as `useCreateRoutePlan`,
  M5.4). `state/current-active-trip-store.ts` is an ephemeral single-trip slot, the same shape and
  the same reason as `current-route-plan-store.ts` (M5.5): core has no `GET
/routing/trips/:id` to re-fetch from, and M5.6 deliberately doesn't add one (see deviations,
  below). `hooks/use-live-location.ts` wraps `expo-location`'s `watchPositionAsync` for the
  screen's live-following map — a continuous subscription, unlike `useCurrentLocation`'s one-shot
  `queryFn` (M5.4), so it stays a plain `useEffect` rather than forcing TanStack Query's
  one-shot-fetch shape onto an open-ended stream; the async, testable half is split out as
  `startWatchingPosition`, same split `fetchCurrentLocation` used. `components/route-map.tsx`
  gained an optional `currentPosition` prop (a distinct "you are here" marker and a closer
  street-level follow zoom, since a driver's live position drifts off the planned origin the
  moment a trip starts) — `route-overview`/`plan-route` are unaffected, since neither passes it.
  `route-overview.tsx`'s "Start trip" button goes live (was shipped visibly disabled in M5.5,
  decision recorded there) and now stores the started trip and navigates to the new
  `app/active-trip.tsx` screen: live-following map, an upcoming-hazards list reusing the
  already-planned route's `hazardsOnRoute` (no new hazards fetch — M5.7/M5.8 territory), a real
  "End trip" button, and a disabled "Report hazard" mic button shown per the design doc's own
  screen table but honestly disabled (M7 territory), matching the same shipped-but-disabled
  pattern M5.5 used for "Start trip" itself. New `lib/error-messages.ts` entries for the three new
  error tags.

37 contracts tests (up from 33), 423 core tests (370 passing — see verification note below), 62
driver-bff tests (up from 56), 77 driver-app tests (up from 67), 17 architecture tests. `pnpm arch`
clean (263 modules, up from 248; 871 dependencies, up from 790). `pnpm lint`/`typecheck`/
`format:check` all clean across every package.

**Verified by actually running it, with one real gap this time — Docker Desktop's daemon isn't
reachable on this machine in this session** (`docker info` connects as a client but the server
section fails: "failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
... The system cannot find the file specified"; no `Docker Desktop.exe` found at the usual
install path either). This is a session/environment gap, not a code problem — every other
Testcontainers-backed Postgres suite in this repo (identity, hazards, routing's other two
repositories) fails identically and for the same reason, not just the new
`postgres-active-trip-repository.test.ts`. So: the full non-Docker surface was verified for
real — `pnpm typecheck`/`lint`/`format:check`/`arch` clean across every package, all 370 passing
core tests (46 of 53 test files; the 7 failing files are exactly the seven Postgres-backed
repository suites, identical failure for all of them), all 62 driver-bff tests (route proxying
verified against a fake `CoreClient`, including a 409 relay), all 77 driver-app tests,
and a real `expo start` run confirmed `.expo/types/router.d.ts` now includes `/active-trip`
before `tsc --noEmit` was trusted (same discipline M5.5 established). **Not verified**: the new
`PostgresActiveTripRepository` and the partial unique index against a real Postgres — it's
written to the same pattern `PostgresRoutePlanRepository` already proved works, and a real test
for it exists and passes typecheck/lint, but it has never actually run. Also not verified, same
hardware gap as every driver-app milestone since M5.1: an actual running app (map render, GPS
watch, or the two new screens on a device/simulator).

## Decisions from M5.6

53. **`ActiveTrip` duplicates `driverId` off the `RoutePlan` it started from**, extending decision
    49's reasoning (`RoutePlan` duplicating `driverId` off `VehicleProfile`) one level further —
    every ownership check in `routing` now follows the same no-join pattern.
54. **One active trip per driver at a time, enforced twice**: `startTrip`'s own
    `findActiveForDriver` check (clear error, `TripAlreadyActive`), backed by a database-level
    partial unique index for the race the application check alone can't close. Chosen over
    leaving the race open the way M1.5's invite-code redemption race was left open, because a
    partial unique index here was nearly free — no new table, no new column, just a `where`
    clause on the index this table needed anyway.
55. **No `GET /routing/trips/:id` (or `/trips/active`) endpoint — a driver relaunching mid-trip
    loses the app's own record of it.** Deliberately scoped down the same way M5.5 scoped down
    the "no `RoutePlan` re-fetch" gap: core has nowhere near enough of a trip-history feature to
    justify one yet, and the ephemeral client-side store this task adds is the same shape M5.5
    already established. If testers actually hit this (backgrounding the app mid-trip on real
    Android/iOS, not just this machine's hardware gap), it's the first thing to add.
56. **No `TripStarted`/`TripEnded` domain events wired**, despite the design doc listing both —
    matches `RoutePlanned`'s own precedent (unwired since M2.5): an event with no subscriber is
    untested plumbing, and M6 is what gives either event a real handler.

## Deviations and open items from M5.6

- **`PostgresActiveTripRepository` and the migration's partial unique index are unverified against
  a real Postgres** — Docker Desktop's daemon isn't reachable on this machine this session (see
  the verification note above). Every other Postgres-backed repository in this repo is equally
  unverified in this same session, for the same reason — not a gap specific to this task. Revisit
  the next time Docker is available; nothing here is expected to fail, but "expected to work" and
  "verified" are different claims, and M1.4/M1.5's own standard is not to blur them.
- **No position-update endpoint.** `lastPosition` exists on the domain and in the schema but is
  never written — the live GPS point only ever exists client-side (the active-trip screen's map),
  never reaches core. Needed before M6's reroute alerts can use a driver's last known position.
- **No background location.** `useLiveLocation` only tracks while the app is foregrounded and the
  screen is mounted — correct for "map following position" but not enough for M6's reroute alerts,
  which need a position even while the driver isn't looking at the phone.
- **The mic button and reroute prompts are placeholders, per this task's own scope note** (M6/M7),
  matching M5.5's "Start trip" precedent for a shipped-but-honestly-disabled feature.

**Follow-up, same day — Docker verification gap closed, two real bugs found and fixed.** Docker
Desktop became reachable on this machine shortly after M5.6 merged. Re-running the full core
suite against real Postgres found two genuine, pre-existing test failures the Docker-less run
never got a chance to catch — not flaky, not environment noise:

- `src/platform/migrations/run-migrations.test.ts` hardcoded the exact list of migration files
  (`result.applied`, `public.schema_migrations` rows) and the `routing` schema's exact table list.
  Both assertions predate M5.6 and were always going to break the moment a sixth migration file
  landed — they just had no chance to run and say so until Docker came back. Fixed by adding
  `'0006_active_trips.sql'` and `'active_trips'` to the expected lists.
- With that fixed, all 53 core test files / 423 tests pass for real, including
  `postgres-active-trip-repository.test.ts` (the repository this milestone added) and the
  migration's partial unique index (decision 54) — both genuinely exercised against a real
  Postgres container for the first time, not just typechecked. This resolves the "unverified
  against a real Postgres" deviation above; it was accurate when written, not overtaken by a
  silent rewrite.

**Decision 57.** Hardcoding a migration runner test's exact file/table list is a real, if minor,
maintenance cost every future migration pays — worth knowing about, not necessarily worth fixing
now (asserting "the last file is `N` and everything before it still applies" would be more
robust, but that's a test-design change with no user-facing effect and no milestone currently
needs it).

**M5.7 delivered:** report hazard (tap) + hazard detail — the write side (report/confirm/dismiss)
already existed from M3/M4; this closed a real gap M3/M4 left (no way to _read_ a hazard back)
and built the two driver-app screens on top.

- **Gap found and closed: `GET /hazards/reports/:id`.** `HazardRepository.findById` existed in
  the port since M3, but nothing in `interface/routes.ts` ever exposed it over HTTP — confirmed
  by checking, not assumed, the same way M5.5 confirmed no `RoutePlan` re-fetch endpoint and M5.6
  confirmed no `ActiveTrip` backend at all. New `getHazard` use case (mirrors `getVehicleProfile`,
  no ownership check per decision 63), proxied through the BFF, same shape as confirm/dismiss.
  Deliberately skips `requireDriverId` in the handler, matching confirm/dismiss's own established
  local pattern (decision 63 — a hazard report is community data with no per-driver
  authorization) rather than introducing a third auth-check shape in this one route.
- **`lib/hazard-labels.ts`**: plain-word labels for all eight `HazardType`s (AGENTS.md: "Low
  bridge", "Too heavy for this road" — not "restriction" or "prohibition") and the
  type→measurement-kind mapping (only `low_bridge`/`weight_limit`/`width_restriction` have
  anything to measure).
- **`lib/hazard-report-form.ts`**: pure parse/validate, same split as `vehicle-profile-form.ts` —
  mirrors core's own `validateMeasurement` so a driver sees the same "must be a positive number"
  rule before a network round trip.
- **`app/report-hazard.tsx`**: tap-to-drop on the map (reusing `RouteMap`'s existing
  `onMapPress`/`currentPosition`), an eight-item type grid (no dropdown — nothing to scroll or
  type while parked, per the design doc's tap-report principle), an optional measurement field
  that only appears for a measured type, an optional note, and a real submit. `expo-crypto`
  (`Crypto.randomUUID()`) added as a dependency for the client-generated idempotency id
  `reportHazard` has always expected (design doc §5 step 2) — branded via
  `hazardReportIdSchema.parse()` at the point of generation, the same brand-at-the-boundary
  pattern `routing.test.ts` already used for test fixtures, now used for real in shipped code.
- **`app/hazards/[id].tsx`**: the detail screen — type, measurement (height shown with
  feet/inches via the existing `formatHeightWithFeetInches`, AGENTS.md), note, when reported,
  confirmation/dismissal counts, and real "Still there" / "Not there" buttons wired to the
  existing confirm/dismiss endpoints.
- **`api/hazards.ts` + `api/use-hazards.ts`**: `reportHazard`/`getHazard`/`confirmHazard`/
  `dismissHazard` API calls and their TanStack hooks — `useReportHazard` a mutation (an action,
  same reasoning as `useCreateRoutePlan`/`useStartTrip`), `useHazard` a query, confirm/dismiss
  mutations invalidate that query's cache key on success so the detail screen reflects its own
  action immediately.
- **New `home.tsx` entry point**: "Report hazard", the tap-report screen's reachable-for-real
  starting point (parked use, per the design doc). Reporting navigates straight to the new
  hazard's own detail screen on success, closing report → detail into one flow.
- **`lib/error-messages.ts`** gained `hazardsErrorMessage` (a second per-module map, alongside
  `routingErrorMessage` — same established pattern, not a shared one, since the tag namespaces
  are module-specific even though `ApiError` itself is shared).

98 driver-app tests (up from 77 — `hazards.test.ts`, `hazard-labels.test.ts`,
`hazard-report-form.test.ts`, `format-date.test.ts`), 428 core tests (up from 423 —
`get-hazard.test.ts` plus new `routes.test.ts` cases), 66 driver-bff tests (up from 62). `pnpm
arch` clean (277 modules, up from 263; 908 dependencies, up from 871). `pnpm lint`/`typecheck`/
`format:check` all clean across every package.

**Verified by actually running it, Docker still up from the M5.6 follow-up** so this is a genuine
run, not a disclosed gap this time: all 428 core tests (including the new `getHazard` route
against a real Postgres-backed `routes.test.ts` harness — the harness itself is in-memory, per
existing convention, but the suite runs in the same process alongside the real Postgres
integration suites that did run for real), all 66 driver-bff tests, all 98 driver-app tests;
`npx expo-doctor` 21/21; a real `expo start` run confirmed `.expo/types/router.d.ts` includes both
`/report-hazard` and `/hazards/[id]` before `tsc --noEmit` was trusted; `npx expo export
--platform android` produced a real Hermes bundle (1576 modules, up from M5.6's 1554). **Not
verified**: an actual running app — same hardware gap as every driver-app milestone since M5.1
(no native build toolchain, no Android SDK, no macOS on this machine).

## Decisions from M5.7

58. **Hazard detail is reachable in this app only by just having reported a hazard — not by
    tapping an existing hazard pin on a map.** There's no hazards-on-map display anywhere in the
    app yet (route-overview/active-trip both still just list `hazardsOnRoute` as opaque text, per
    M5.5/M5.6), and building one was never this task's scope (the design doc's own screen table
    lists "Report hazard (tap)" and "Hazard detail" as two screens, not "browse hazards on a
    map"). Recorded as a deliberate scope-down, not a silently narrower feature.
59. **`GET /hazards/reports/:id` has no ownership check**, extending decision 63's reasoning
    (confirm/dismiss have none either) to the read side: a hazard report is community data any
    authenticated driver can see, not scoped to its reporter.

## Deviations and open items from M5.7

- **No hazards-on-map display.** Neither `route-overview` nor `active-trip` shows hazard pins —
  they still only list `hazardsOnRoute`'s opaque ids as plain text (M5.5/M5.6, and that field is
  itself always empty per M2.5's own deviations). A future task wiring a real map display would
  also be what makes hazard detail reachable by tapping a pin, closing decision 58's gap.
- **No offline queue** — M5.8's job. Reporting with no connectivity currently just fails with the
  generic "couldn't reach the server" message; the client-generated idempotency id already in
  place (this task) is exactly what M5.8's retry-safe queue needs, so nothing here has to change
  to add it.
- **No voice reporting** — M7's job, per the design doc's own hands-free principle. This screen is
  deliberately the tap-only, parked-use half.

**M5.8 delivered:** the offline hazard queue — `expo-sqlite`, per the design doc's own choice
(§8), added as a real dependency (`app.config.ts`'s `plugins` gained `expo-sqlite`, matching how
`expo-location`/`expo-crypto` were each added on the milestone that first needed them).

- **`lib/hazard-queue-flush.ts`**: the one piece of actual policy — `flushQueuedReports(queued,
submit)`, a pure function with no SQLite and no `fetch` (`submit` is injected, same split
  `parseHazardReportForm`/`startWatchingPosition` already use). Sends queued reports in order,
  stopping at the first failure rather than trying every item: a failure here almost always means
  "no connectivity," so trying the rest would only waste time for the same result. Fully unit
  tested with fakes — no native module, no mocking needed.
- **`db/hazard-queue.ts`**: the thin, deliberately dumb SQLite CRUD layer — `enqueueHazardReport`/
  `listQueuedHazardReports`/`removeQueuedHazardReport` against one `hazard_queue` table. Verified
  against `expo-sqlite`'s real installed type declarations (`openDatabaseSync`/`execSync`/
  `runAsync`/`getAllAsync`), the same discipline M5.4/M5.5 used for MapLibre — and, unlike
  MapLibre, tested for real too: `jest.mock('expo-sqlite', ...)` stands in a small in-memory fake
  keyed off the actual SQL text this module sends, exercising this module's own SQL and
  `reportHazardRequestSchema`-based re-branding logic without a real native database.
- **`hooks/use-hazard-queue-flush.ts`**: wires the two together, opportunistically — on mount and
  whenever the app returns to the foreground, same shape as `useOpportunisticRefresh` (M5.2) and
  for the same reason (a scheduled/one-shot trigger can be missed while the app is suspended). No
  NetInfo/network-listener dependency added — a failed attempt is cheap, and the next foreground/
  mount tries again, so polling-by-opportunity is enough for Phase 1. Wired into `_layout.tsx`
  alongside the token-refresh hook.
- **`report-hazard.tsx` reworked**: a report is written to the local queue _before_ the network
  is ever touched (design doc §5's "stores it locally first"), then a send is attempted
  immediately — succeed, and the flow is unchanged from M5.7 (remove from the queue, navigate to
  the new hazard's detail screen); fail, and the report stays queued (no error shown — a new
  "Saved" screen explains it'll go out automatically once back online) rather than making a
  driver retry by hand. The M5.7 mutation is reused for the immediate-attempt path; the queue
  itself is what makes a dropped connection non-fatal.

106 driver-app tests (up from 98 — `hazard-queue-flush.test.ts`, `hazard-queue.test.ts`). `pnpm
arch` clean (283 modules, up from 277; 918 dependencies, up from 908). `pnpm lint`/`typecheck`/
`format:check` all clean across every package. Core/BFF untouched this task — no new test counts
there.

**Verified by actually running it**: all 106 driver-app tests (including the queue's SQL logic
against a mocked `expo-sqlite`, not left untested the way MapLibre/watchPositionAsync's native
calls are); `npx expo-doctor` 21/21; `npx expo export --platform android` produced a real Hermes
bundle (1606 modules, up from M5.7's 1576). **Not verified**: an actual running app — same
hardware gap as every driver-app milestone since M5.1 (no native build toolchain, no Android SDK,
no macOS on this machine) — so the real SQLite file I/O, the AppState foreground listener, and
the actual offline→online transition have never been exercised on a real device.

Also fixed, found while updating this milestone's docs: **`README.md`'s driver-app section had
gone stale** — M5.6 and M5.7 never got README entries (only `docs/progress.md` did), so it still
said "Start trip" pointed nowhere and the repo-layout table still said "M5.1 skeleton only." Not
this task's own scope, but left broken would have kept misinforming a cold start, which AGENTS.md
treats as the one thing this file must never do — fixed alongside M5.8's own entry rather than
carried forward again.

## Decisions from M5.8

60. **A failed flush attempt stops the whole pass rather than skipping to the next queued
    item.** Extends decision 54's precedent for scoped-down-but-honest tradeoffs: the common
    failure mode (no connectivity) would fail every remaining item identically, so trying them
    anyway just spends battery and time for the same outcome. The cost: a queued item that fails
    for a genuinely permanent reason (not connectivity) would block every report _behind_ it too,
    not just itself — accepted because the one rule that could cause a permanent failure
    (`validateMeasurement`) is already enforced client-side before anything is ever queued, so
    this case is expected to be unreachable, not unhandled by design (same reasoning class as
    M1.5's invite-code race).
61. **No network-state listener (e.g. NetInfo) — opportunistic triggers only (mount +
    foreground).** Matches `useOpportunisticRefresh`'s own precedent and avoids a new dependency
    for a Phase 1 testers-count scale where "try again next time the app is opened" is good
    enough.

## Deviations and open items from M5.8

- **A permanently-failing queued report blocks everything behind it**, per decision 60 — no
  adjudication UI exists to inspect, retry individually, or drop a stuck queue entry. Revisit if
  testers ever hit this for real (expected not to, since the one known cause is already
  client-side validated before queuing).
- **Real SQLite persistence across an app relaunch is unverified** — same hardware gap as the rest
  of this milestone. The schema and CRUD are verified against `expo-sqlite`'s real API surface and
  tested against a faithful in-memory stand-in, not against the real native module.
- **No cached-hazards-for-offline-display feature**, despite the design doc's §8 SQLite line
  mentioning "the offline hazard queue and cached hazards" together — the M5 task breakdown names
  only "Offline hazard queue" for M5.8, and there's still no hazards-on-map display anywhere in
  the app to cache data for (M5.7 decision 58's own gap, still open).

**M5.9 delivered:** the feedback screen — and, since `feedback` was the last of the four bounded
contexts named in AGENTS.md rule 6 with genuinely nothing built (confirmed by checking, same as
every other "doesn't exist yet" gap this session found: M5.6's `ActiveTrip`, M5.7's hazard GET),
the whole module to go with it: domain, one use case, a migration, one endpoint, a BFF proxy, and
the driver-app screen.

- **`modules/feedback/`**: the smallest module in the repo — `FeedbackNote { id, driverId,
message, appVersion, deviceInfo, createdAt }`, `validateMessage` (non-blank, mirrors routing's
  `validateName`), one `submitFeedback` use case, a `FeedbackNoteRepository` port with a single
  `save` method (insert-only, no `findById` — there is no read use case at all: design doc §8's
  "free-text notes to you" is one-way, read later via `psql`, not back through the app).
  `appVersion`/`deviceInfo` are trusted and stored as given, the same way a hazard report's `note`
  field is — diagnostic context for whoever reads feedback, not data the domain acts on.
- **Migration `0007_feedback.sql`**: `feedback.notes`, in the `feedback` schema `0001_init.sql`
  already created back in M1.4 (a schema with no tables in it until now).
- **`POST /feedback/notes`** (201) — same `requireDriverId`/zod-body/`statusFor()` shape as every
  other module's routes. `/feedback/` added to `DRIVER_AUTH_PREFIXES`
  (`host/build-app.ts`) — found and fixed the one test that specifically asserted `/feedback/`
  was _not_ yet gated (`build-app.test.ts`, written in M4.2/M4.3 as "a future module"); now it's
  parameterized across all three real prefixes, with a genuinely different placeholder
  (`/admin/`) standing in for "some module that still doesn't exist."
- **`packages/contracts/src/feedback.ts`**: `submitFeedbackRequestSchema` (no `driverId` field,
  same reasoning as every other create-request schema), `feedbackNoteSchema`. New `./feedback`
  subpath export added to `package.json`, matching `./routing`/`./hazards`.
- **`apps/driver-bff/src/feedback-routes.ts`**: one proxy route, same forward-and-relay shape as
  every other module's BFF routes.
- **driver-app**: `api/feedback.ts` + `api/use-feedback.ts` (a mutation, same reasoning as every
  other create-style call). `lib/app-info.ts` reads the app version back out of
  `Constants.expoConfig.version` (`expo-constants`, already an existing dependency — no new one
  needed) and device info from React Native's own built-in `Platform.OS`/`Platform.Version` (no
  `expo-device` dependency added either — a plain `"ios 17.2"`-style string is enough for this
  screen's job). New `app/feedback.tsx`: a free-text note, "Send," and a "Thanks" confirmation —
  reachable from a new `home.tsx` entry point.

70 driver-bff tests (up from 66), 114 driver-app tests (up from 106 — `feedback.test.ts`,
`app-info.test.ts`), 437 core tests (up from 428 — the new module's own tests plus two
`run-migrations.test.ts` fixes, see below), 41 contracts tests (up from 37). `pnpm arch` clean
(306 modules, up from 283; 997 dependencies, up from 918). `pnpm lint`/`typecheck`/`format:check`
all clean across every package.

**Also fixed, found the same way M5.6's follow-up found it**: `run-migrations.test.ts` hardcoded
the exact migration-file list and the `routing` schema's table list (decision 57's own prediction
from the M5.6 follow-up — "a real, if minor, maintenance cost every future migration pays").
Fixed the same way as that follow-up: added `'0007_feedback.sql'` to both hardcoded lists, and
added the `feedback` schema's own table assertion (`['notes']`), which didn't exist yet for any
prior module's first migration into a fresh schema.

**Verified by actually running it, all for real this time — Docker was already up from the M5.6
follow-up**: all 437 core tests (including the new `postgres-feedback-note-repository.test.ts`
against a real Postgres container — inserted a real row, read it back with a raw `pool.query`,
since there's no repository-level `findById` to round-trip through), all 70 driver-bff tests, all
114 driver-app tests; `npx expo-doctor` 21/21; a real `expo start` run confirmed
`.expo/types/router.d.ts` includes `/feedback` before `tsc --noEmit` was trusted; `npx expo export
--platform android` produced a real Hermes bundle (1611 modules, up from M5.8's 1606). Also
refreshed several more stale spots in `README.md` beyond the driver-app section M5.8 already
fixed — the repo-layout table's `modules/` line still said "routing, hazards, feedback not
started" (wrong since M2/M3), and the driver-bff status line was missing `feedback`. **Not
verified**: an actual running app — same hardware gap as every driver-app milestone since M5.1.

## Decisions from M5.9

62. **`FeedbackNoteRepository` has only `save` — no `findById`, no list.** Matches the module's
    own scope exactly: design doc §8 describes a one-way channel to the developer, and every
    other module in this codebase only grows a read method once a real caller needs one (M2.3's
    `RoutingEngine`, M5.7's `getHazard`). Revisit if an admin/staff view of feedback is ever
    built — explicitly out of scope for Phase 1 (AGENTS.md: staff portal is Phase 2).
63. **`appVersion`/`deviceInfo` are untyped, unvalidated strings the app builds itself** — no
    shared "device info" contract, no enum of known OS names. They're diagnostic context for a
    human reader, not data the domain branches on, so structuring them further would be ceremony
    with no behaviour behind it (same reasoning as a hazard report's free-text `note`).
64. **Device info comes from React Native's built-in `Platform` module, not a new `expo-device`
    dependency.** `Platform.OS`/`Platform.Version` already ship with every RN app and are enough
    for "which OS and roughly which version filed this" — the extra precision `expo-device` adds
    (exact model name, product name) has no reader who needs it yet.

## Deviations and open items from M5.9

- **No admin/read UI for feedback notes** — deliberately out of scope (decision 62); read via
  `psql` for now, matching M1.5's identical deviation for invite codes before any admin tooling
  existed.
- **Real device info strings are unverified** — `Platform.OS`/`Platform.Version`'s exact output on
  a real device (e.g. whether Android's `Platform.Version` is the API level or a version string)
  is documented behaviour, not independently confirmed against real hardware, same hardware gap
  as the rest of this milestone.
- That closes M5.1–M5.9. **M5.10** (real-device/simulator verification, EAS Build → TestFlight +
  Play internal) is the only M5 task left, and it is explicitly the one task in this milestone
  that cannot be done from this machine — it needs a real Expo account, a real device or
  simulator, and (for the store submissions) Apple/Google developer accounts the user must set up
  themselves. **Deliberately deferred by the user (2026-09-23), not forgotten** — skipped ahead
  to M6 instead, with an explicit ask to come back to M5.10 later.
