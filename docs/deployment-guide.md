# Deployment guide (M8 spike, 2026-09-25)

How to get `core` and `driver-bff` reachable from outside the dev machine, on DigitalOcean.
This is the missing piece behind M5.10's "EAS Build → TestFlight + Play internal" and M8's
"first driver onboarded" — a tester on their own network can't reach `192.168.1.50:3002`.

**Status: live.** Deployed and verified end to end 2026-09-25 —
`https://wagonwise-backend-o2baa.ondigitalocean.app` answers `/health`, and a real
`POST /identity/otp/request` round-tripped driver-app-shape request → `driver-bff` (public) →
`core` (private VPC) → Postgres → a real ClickSend SMS, delivered. See §4 for what's actually
provisioned and §7 for four real bugs found getting here.

## 0. This week's plan

Goal: the backend reachable from outside the house, this week. Everything below is scoped
down to exactly that — no more, no less:

- **No staging environment** — one deployed environment is enough until there are paying
  customers or an automatic deploy-on-merge pipeline exists (neither is true yet). See
  `docs/progress.md`'s decisions log if that reasoning needs revisiting later.
- **No custom domain yet** — App Platform's free `*.ondigitalocean.app` URL gets HTTPS and a
  stable address for nothing extra. The domain purchase is a separate track (§6), blocked on
  a proper trademark check, not on this week's goal.
- **Northumberland Valhalla extract only** — not UK-wide (a separate, later decision).
  **Superseded**: expanded to Northumberland + Tyne and Wear + Cumbria on 2026-09-26 (§7's
  provisioned list), then to the whole of Great Britain on 2026-10-16 (§10).

Checklist, in order — **all done as of 2026-09-25** except the last step:

1. ✅ DO console: Managed PostgreSQL (`db-pgsql-lon1-09118`, PG17) → Valhalla droplet
   (`wagonwise-valhalla-lon1`) → App Platform app (`wagonwise-backend`) with `core` +
   `driver-bff`. All three land in the same `default-lon1` VPC automatically **except the App
   Platform app itself**, which needs an explicit `vpc.id` in its spec to actually get a route
   into that VPC — missing at first, causing the bug documented in §7 #3. Full detail in §4.
2. ✅ `IDENTITY_PRIVATE_KEY`, `INTERNAL_KEYS`/`CORE_INTERNAL_KEY`, `ANTHROPIC_API_KEY`,
   `CLICKSEND_USERNAME`/`CLICKSEND_API_KEY` all set as encrypted App Platform env vars — none
   written here or committed anywhere.
3. ✅ `pnpm db:migrate` run against the managed database — all 11 migrations applied, PostGIS
   3.6 enabled. **Superseded 2026-09-26** by a `migrate` `PRE_DEPLOY` job in the app spec (§4)
   — migrations now run automatically on every deploy, no more manual `pnpm db:migrate` after
   each one that adds a migration file.
4. ⬜ **Next:** update the EAS `preview` build profile's `EXPO_PUBLIC_BFF_URL` to
   `https://wagonwise-backend-o2baa.ondigitalocean.app`, rebuild (`eas build --profile preview
--platform android`), reinstall on your phone.
5. ⬜ Prove it: Wi-Fi off, mobile data on, open the app. That's "outside the house."

## 1. What needs hosting, and what doesn't

| Piece                     | Needs hosting? | Notes                                                        |
| ------------------------- | -------------- | ------------------------------------------------------------ |
| `apps/core`               | Yes            | Private only — never reachable from outside                  |
| `apps/driver-bff`         | Yes            | The one public HTTP surface                                  |
| Postgres + PostGIS        | Yes            | Currently `infra/docker/compose.yml`'s local container       |
| Valhalla                  | Yes            | Live: Great Britain (§10). Local dev: Northumberland extract |
| MapTiler (map tiles)      | No             | Already a hosted SaaS, just needs the API key set            |
| Anthropic (voice parsing) | No             | Already a hosted SaaS, just needs `ANTHROPIC_API_KEY` set    |
| Expo Push                 | No             | Already a hosted SaaS                                        |

## 2. Gaps found during this spike, beyond hosting

These block a real driver using the app even once everything below is deployed — worth
knowing about now rather than discovering them after the infra is up.

1. ~~No real SMS/email `OtpSender`~~ — **resolved 2026-09-25.** `ClickSendOtpSender` (SMS) and
   `ResendOtpSender` (email) each independently fall back to `ConsoleOtpSender` if unconfigured;
   `ChannelRoutingOtpSender` picks between them per identifier. Both verified against their real
   APIs — a real SMS and a real email, sent and received. **The SMS half shipped broken for a
   while first**: it was built and tested locally but never actually committed, so the deployed
   backend silently kept using `ConsoleOtpSender` for every sign-in — caught only when a live
   sign-in with an email identifier produced no error and no email either, which shouldn't have
   been possible. Lesson: a `200` response from `/identity/otp/request` proves nothing about
   which channel handled it, since every sender returns the same shape on success — check the
   provider's own delivery log (ClickSend/Resend history), not just the HTTP status, to actually
   verify a deploy. All four env vars (`CLICKSEND_USERNAME`/`CLICKSEND_API_KEY`,
   `RESEND_API_KEY`/`RESEND_FROM_EMAIL`) need to reach `core` in App Platform (§4).
   **Resend needs a verified domain (found 2026-10-08).** Without `RESEND_FROM_EMAIL`, core sends
   from Resend's sandbox address, which only delivers to the Resend account owner's own email;
   everyone else gets a 403 (`The wagon-wise.co.uk domain is not verified` / `You can only send
testing emails to your own email address`) and sign-in answers "something went wrong". Fix:
   Resend → Domains → add `wagon-wise.co.uk`, add the records it shows in Cloudflare (DNS only,
   not proxied), wait for **Verified**, then set `RESEND_FROM_EMAIL` on core to
   `WagonWise <noreply@wagon-wise.co.uk>`. Core logs the reason on a failed send (`Resend API
returned 403 …`): search core's runtime logs for the request id. Only core talks to Resend.
   **Replies (2026-11-08):** that sender is a no-reply address, but the tester emails say "just
   reply to this email". Set `RESEND_REPLY_TO` on core to `support@wagon-wise.co.uk` so a reply
   (the `Reply-To` header on every email core sends) reaches the support inbox.
   A fast 500 from `/identity/otp/request` means core tried and Resend refused; a 200 with no
   email means the key is missing and the log-only sender ran. Staff sign-in (portal) sends no
   code: it is email + password + authenticator app. Staff **invitations** are emailed as a link
   (needs `DASHBOARD_URL` on core, below); without it the inviter shares the link by hand.
2. **`IDENTITY_PRIVATE_KEY` must be set for real.** Unset, core generates a fresh Ed25519 key
   at every boot — fine for dev (a restart just invalidates sessions), not for anything meant
   to stay up. Generate one PKCS8 PEM and set it as a secret.
3. **`INTERNAL_KEYS` / `CORE_INTERNAL_KEY` must be a real shared secret**, not the
   `local-dev-internal-key` default both sides fall back to.
4. **`ANTHROPIC_API_KEY` must be set**, or voice reports silently degrade to
   `NullHazardParser` (every transcript filed as type `other` with itself as the note).
5. Valhalla covers **Great Britain** (England, Scotland and Wales; expanded on 2026-10-16 from
   Northumberland, Tyne and Wear and Cumbria, see §10). **Northern Ireland is deliberately not
   covered.**

## 3. Recommended architecture (DigitalOcean)

```
                         Internet
                            |
                    driver-app (Expo)
                            |
                       HTTPS, your domain
                            |
                  ┌─────────────────────┐
                  │   DO App Platform    │
                  │  ┌────────────────┐  │
                  │  │  driver-bff    │──┼── public route
                  │  │  (component)   │  │
                  │  └───────┬────────┘  │
                  │          │ private LAN (http://core:3001)
                  │  ┌───────▼────────┐  │
                  │  │     core       │  │  internal_ports only, no public route
                  │  │  (component)   │  │
                  │  └───────┬────────┘  │
                  └──────────┼───────────┘
                             │ VPC private network
              ┌──────────────┴───────────────┐
              │                               │
    ┌─────────▼─────────┐          ┌──────────▼─────────┐
    │ DO Managed Postgres│          │   DO Droplet        │
    │  (PostGIS enabled) │          │   Valhalla container │
    └─────────────────────┘          │  (Great Britain tiles,
                                      │   baked onto a volume) │
                                      └───────────────────────┘
```

**Why this shape:**

- **App Platform for `core` + `driver-bff`**, as two components of one App. App Platform
  supports internal-only services (`internal_ports`, no public route) reachable by other
  components at `http://<component-name>:<port>` over the app's own private LAN — this is
  exactly decision 11's "private networking plus `X-Internal-Key`" from
  `docs/phase-1-tech-design.md`, so no architecture change needed, just infra. Managed
  builds/deploys/TLS/custom-domain, no server to patch.
- **A Droplet for Valhalla, not App Platform.** App Platform has no persistent disk — every
  deploy rebuilds from scratch, which means rebuilding the OSM tiles (minutes) on every
  redeploy. A Droplet with a real disk builds tiles once and keeps them.
- **DO Managed PostgreSQL, not a Droplet**, for the database — backups and PostGIS support
  included, worth the small premium over self-hosting for something this data matters for.
- **One VPC**, one region (London, matching the design doc's own choice) — everything except
  `driver-bff` stays off the public internet.

### Why the two Dockerfiles are built from the repo root

`apps/core` depends on `packages/contracts` via `workspace:*` — pnpm can only resolve that
correctly if the install step sees the whole workspace, not just `apps/core/`. Both
Dockerfiles `COPY` every workspace `package.json` (cheap — they're small text files) for a
filtered `pnpm install --filter "<package>..."`, which pulls in `packages/contracts` and
`packages/config` but skips `driver-app`'s far larger Expo/React Native dependency tree.

### What's actually been verified (this session, locally)

- [`apps/core/Dockerfile`](../apps/core/Dockerfile) and
  [`apps/driver-bff/Dockerfile`](../apps/driver-bff/Dockerfile) both build clean.
- `core`'s image, run against the local `infra/docker/compose.yml` Postgres, answers
  `GET /health` with a real `200`.
- `driver-bff`'s image, pointed at `core`'s container over a Docker network via
  `CORE_INTERNAL_URL`, also answers `GET /health` — proving the internal-networking pattern
  App Platform will use actually works, not just that it should in theory.
- Found and fixed a real bug while doing this: the repo had no root
  [`.dockerignore`](../.dockerignore). A first attempt at one used bare `node_modules/`,
  `dist/`, etc., which in Docker's ignore syntax only match the repo **root** — every nested
  workspace package's own `node_modules`/`dist` (built locally, for Windows) was still being
  copied into the build context and silently overwriting the container's own Linux build
  output. Fixed with `**/`-prefixed patterns.
- Not yet done: deploying any of this to DigitalOcean itself (needs your account), a real
  Postgres migration run against a managed DB, or an actual Valhalla droplet.

## 4. Setup checklist

1. ~~DO project + VPC in `lon1`~~ — no separate VPC needed. DO groups every resource created
   in a datacenter into that region's own default VPC automatically (`default-lon1`); it
   showed up unprompted when creating the database cluster below.
2. **Managed PostgreSQL** — Standard single-node, **PostgreSQL 17** (not 18 — PostGIS isn't
   available on 18 clusters yet), 1 GB (~$15/mo). Done — created 2026-09-25. Next:
   `CREATE EXTENSION postgis;` on it, then run `pnpm db:migrate` against it once from your
   machine (`DATABASE_URL` pointed at the cluster — DO gives you a connection string with SSL
   params).
3. **Valhalla droplet** — Basic, 2 GB RAM/1 vCPU ($12/mo) to start, same `default-lon1` VPC.
   Install Docker, reuse `infra/docker/compose.yml`'s `valhalla` service definition with the
   Northumberland `.pbf` in a persistent volume. No public IP needed — only `core` talks to
   it, over the VPC. Confirm `curl http://<private-ip>:8002/status` responds.
4. **App Platform App**, two components, both built from this repo via the Dockerfiles above:
   - `core`: `internal_ports: [3001]`, no public route. Env: `DATABASE_URL`,
     `IDENTITY_PRIVATE_KEY`, `INTERNAL_KEYS`, `VALHALLA_URL` (the droplet's private IP),
     `ANTHROPIC_API_KEY`, `CLICKSEND_USERNAME`, `CLICKSEND_API_KEY`, `RESEND_API_KEY`,
     `RESEND_FROM_EMAIL` (an address on the verified domain, see §3 item 1), `RESEND_REPLY_TO`
     (`support@wagon-wise.co.uk`, where replies go), `DASHBOARD_URL`
     (`https://dashboard.wagon-wise.co.uk`, no trailing path; lets staff invitations be emailed),
     `METOFFICE_API_KEY` (Met Office weather warnings from Weather DataHub; optional, unset means
     no warnings; core only, never the BFFs or apps),
     `DVLA_VES_API_KEY` (the DVLA Vehicle Enquiry Service: road tax, and a basic MOT date, by registration; optional),
     `DVSA_MOT_CLIENT_ID`, `DVSA_MOT_CLIENT_SECRET`, `DVSA_MOT_API_KEY` and `DVSA_MOT_TOKEN_URL` (DVSA's MOT history API:
     the MOT or HGV annual test by registration; **all four or none**, a partial set stops core booting; the token address is the
     Microsoft one in DVSA's credentials email, with your tenant id; `DVSA_MOT_SCOPE` is optional and defaults to
     `https://tapi.dvsa.gov.uk/.default`). Either source switches the portal's "Check MOT and tax by registration" button on;
     with both, the MOT comes from DVSA and the road tax from DVLA; with neither the button is hidden. Core only, never the
     BFFs, the portal or the apps. **DVSA's API key is revoked if unused for 90 days, and its client secret expires every 2 years**:
     diarise both (a new secret is issued through DVSA's `/credentials` endpoint),
     `TOMTOM_API_KEY` (TomTom live traffic; optional, unset means no traffic data; core only, never the
     BFFs or apps; `TRAFFIC_DAILY_REQUEST_LIMIT` caps calls a day, default 2000, under the free tier's 2,500),
     `W3W_API_KEY` (what3words: search by three words, and the three words for where a driver is; optional, unset means
     no lookup and the app says it is not available; core only, never the BFFs or apps; the Basic plan is 1,000 lookups
     a month and the app asks only when the driver asks, so watch the count in the what3words account),
     `FUEL_FINDER_ID` and `FUEL_FINDER_SECRET` (GOV.UK Fuel Finder, pump prices by station: **both or neither**, one alone
     stops core booting; core only, never the BFFs or apps; the live credentials from the Fuel Finder developer portal, and
     `FUEL_FINDER_URL` is optional and defaults to the live service; with both set core copies every station and price
     into the `fuelprices` schema at boot and then every hour, about 34 requests each time, and `FUEL_REFRESH_INTERVAL_MS`
     changes that (never under 10 minutes). **Run one core instance only**: the service allows one request at a time),
     `NATIONAL_HIGHWAYS_PRIMARY_KEY` and, optionally, `NATIONAL_HIGHWAYS_SECONDARY_KEY` (National Highways road and lane
     closures on motorways and major A roads, from developer.data.nationalhighways.co.uk, Road and Lane Closures v2.0; core
     only, never the BFFs or apps; unset means no closures and no requests; the secondary is tried if the primary is
     refused, so a key can be replaced without a gap; with a key set core copies the feed into the `closures` schema at boot
     and then every ten minutes (one ~10 MB request), and `CLOSURES_REFRESH_INTERVAL_MS` changes that (never under five
     minutes). Free for now; National Highways may charge later with at least six months' notice),
     `STAFF_SECRET_KEY` (`openssl rand -base64 32`; keep a copy somewhere safe: losing it
     makes every staff authenticator-app enrolment unreadable), `APP_DATABASE_URL` (below),
     `NODE_ENV=production`.
   - **`APP_DATABASE_URL`, added P2-M1.7.** Core should serve requests as `wagonwise_app`, a
     role that owns no tables, so Postgres Row-Level Security keeps each company to its own
     rows (the owner skips RLS). Migration 0021 creates the role without a password; give it
     one once, connected as `doadmin` (DO console → the cluster → Connection details → psql):
     `alter role wagonwise_app with login password '<openssl rand -base64 24>';`. Then set
     `APP_DATABASE_URL` on `core` only: `DATABASE_URL` with `doadmin` and its password swapped
     for `wagonwise_app` and the new one (keep `?sslmode=require`). Leave `DATABASE_URL` as it
     is: the `migrate` job still needs the owner. Until `APP_DATABASE_URL` is set, core keeps
     serving on `DATABASE_URL` exactly as before.
   - `driver-bff`: public route on your domain. Env: `CORE_INTERNAL_URL=http://core:3001`,
     `CORE_INTERNAL_KEY` (must match one of `core`'s `INTERNAL_KEYS`), `NODE_ENV=production`.
   - Basic containers, $5/mo each, to start.
   - **`migrate` job (`kind: PRE_DEPLOY`), added 2026-09-26.** Same image as `core`, entrypoint
     overridden to `pnpm --filter @wagonwise/core run db:migrate`. DO runs this once before
     swapping in a new `core`/`driver-bff` deploy; if it fails (a bad migration), the deploy
     aborts and the previous version keeps serving traffic — migrations no longer need a manual
     `pnpm db:migrate` run after every deploy that adds one. `DATABASE_URL` turned out to live as
     an **App-Level Environment Variable** (shared across every component, set once in the app's
     own Settings rather than any single component's panel) — see §7 bug #4 for why applying
     this job via `doctl apps update --spec` briefly took production down.
5. **Domain — not needed for this week's goal** (§0, §6). App Platform's own
   `*.ondigitalocean.app` URL already has a managed TLS cert and works fine to start; point a
   real domain at it later once one's bought and the trademark check (§6) is done.
6. **Driver app**: set `EXPO_PUBLIC_BFF_URL` to the App Platform URL (`https://<something>
.ondigitalocean.app` for now, a real domain later) in the EAS `preview` build profile
   (`apps/driver-app/eas.json`) — that's the profile actually used for sideloaded personal
   testing right now; switch `production`'s to match once a Play Store submission is real.
7. ~~Decide on the `OtpSender` gap~~ — resolved same day (§2.1): `ClickSendOtpSender` is live
   and its env vars are set on `core`.
8. **The first WagonWise admin (P2-M1.12b), once, after a deploy that includes migration 0024.**
   In DO: the app → `core` component → **Console** tab, then:
   ```bash
   cd /repo/apps/core
   pnpm staff:bootstrap --email you@example.com --name "Your Name" --dashboard-url https://<dashboard address>
   ```
   It prints a join link valid for 7 days: open it, choose a password and a second factor, and
   save the recovery codes. From then on invite everyone else from the dashboard's Users
   screen. The command refuses once any WagonWise admin exists; running it again before the
   link is used just prints a fresh one. `STAFF_SECRET_KEY` must be set on `core` before you
   do this, or an authenticator-app set-up won't survive the next deploy.
   **From P2-M1.12c the dashboard has no driver sign-in**: it signs in with staff accounts
   only, through `staff-bff`. Deploy `staff-bff` and point the dashboard at it
   (`VITE_STAFF_BFF_URL`) before or with 12c, and run this step straight after, or nobody can
   use the dashboard in between. Former driver admins are invited again from Users. Steps for
   `staff-bff` itself are step 9, below — do that step (and the `APP_DATABASE_URL` half of it)
   **before** this one.
9. **`staff-bff` + the dashboard itself (P2-M1.12d).** Neither had a deploy story before this —
   the dashboard has only ever been run locally against local `staff-bff`/`core`. Spec changes
   for both are in `infra/digitalocean/app-spec.yaml` (unverified against the real app as
   written — see that file's own header comment and §7 bug #4's warning about `doctl apps
update --spec` before applying it):
   - **`staff-bff`** joins `core`/`driver-bff` as a third component on the same
     `wagonwise-backend` app, reachable at `api.wagon-wise.co.uk/staff/*` (path-routed via the
     spec's `ingress.rules`, not its own subdomain — its own routes are already namespaced under
     `/staff`). Needs `CORE_INTERNAL_KEY` set as an encrypted secret, matching one of `core`'s
     `INTERNAL_KEYS` (same value `driver-bff` already uses works fine — `INTERNAL_KEYS` accepts
     more than one at once, decision 11).
   - **The dashboard** is a static site (no Dockerfile — `vite build`'s output, `apps/dashboard/
dist`), on its own subdomain `dashboard.wagon-wise.co.uk` (also added to `domains:` in the
     spec) rather than a path under the API domain, so its client-side routes
     (`/fleet`, `/admin/companies`, …) never need a basename. `VITE_STAFF_BFF_URL` is baked in
     at build time to `https://api.wagon-wise.co.uk` (the **bare origin, no `/staff` suffix** —
     every staff-bff route already carries its own `/staff/...` prefix in `api/staff.ts`, and
     the ingress rule's `preserve_path_prefix` forwards that prefix through unchanged, so adding
     it here too doubles it to `/staff/staff/...` and 404s every request; found and fixed for
     real 2026-10-01, `docs/progress.md`) — not a secret (it ends up in the shipped JS
     regardless), set in the spec file directly.
   - **Map tiles: `VITE_MAPTILER_API_KEY`** on the dashboard component, as a **build-time**
     variable (Vite bakes it in; a run-time-only variable does nothing), then redeploy with a
     rebuild. Unset, Live trips falls back to a plain demo map with no roads. The same MapTiler
     key as the driver app works (a free plan allows one active key, and restricting it to the
     dashboard's address would break the app's maps). The dashboard bundles MapLibre's tile worker
     itself (`src/lib/map-worker.ts`); without that, a production build shows only the map's
     background colour and the vehicle dot, because MapLibre 6 looks for a worker file the build
     does not contain and the host answers with the home page.
   - **`APP_DATABASE_URL`, the Row-Level Security role (P2-M1.7).** Migration 0021 creates
     `wagonwise_app` (owns no tables, so RLS actually applies to it — the owner role bypasses
     RLS) with no password. Give it one once, connected as `doadmin` (DO console → the cluster →
     Connection details → psql): `alter role wagonwise_app with login password '<openssl rand
-base64 24>';`. Then set `APP_DATABASE_URL` on `core` only (encrypted secret): the same
     connection string as `DATABASE_URL` with `doadmin` and its password swapped for
     `wagonwise_app` and the new one (keep `?sslmode=require`). Leave `DATABASE_URL` as-is — the
     `migrate` job and `pnpm staff:bootstrap` (step 8) both need the owner role, never the
     app role. Until `APP_DATABASE_URL` is set, `core` keeps serving on `DATABASE_URL` exactly
     as before (no RLS enforcement) — not a security hole today (nothing company-scoped is
     exposed yet beyond what admin-only gates already cover), but it is the point of P2-M1.7, so
     don't leave it unset longer than it takes to do this step.
   - Apply the updated app spec (merged into the live one, never the raw file — §7 bug #4),
     confirm `staff-bff` and `dashboard` both come up healthy
     (`https://api.wagon-wise.co.uk/staff/health`, `https://dashboard.wagon-wise.co.uk`), then
     do step 8 (bootstrap the first admin).

## 5. Pricing (DigitalOcean, starting tiers)

| Item                        | Tier                               | Monthly     |
| --------------------------- | ---------------------------------- | ----------- |
| App Platform — `core`       | Basic, 1 vCPU shared / 512 MiB     | $5          |
| App Platform — `driver-bff` | Basic, 1 vCPU shared / 512 MiB     | $5          |
| App Platform — `staff-bff`  | Basic, 1 vCPU shared / 512 MiB     | $5          |
| App Platform — `dashboard`  | Static site (no compute charge)    | $0          |
| Managed PostgreSQL          | Standard single-node, 1 GiB        | $15         |
| Droplet — Valhalla          | Basic, 2 GiB / 1 vCPU / 50 GiB SSD | $12         |
| **Total**                   |                                    | **~$42/mo** |

Bump the Valhalla droplet to 4 GiB ($24/mo) if the tile build needs more RAM than 2 GiB gives
it — county-sized extracts are usually fine at 2 GiB, but this wasn't tested against the real
box. This lands well inside the design doc's own £40–120/month estimate for under ~30 drivers.
Outbound data transfer and storage overage are extra but negligible at this scale.

Sources: [DO Droplet pricing](https://www.digitalocean.com/pricing/droplets),
[DO App Platform pricing](https://www.digitalocean.com/pricing/app-platform),
[DO Managed PostgreSQL pricing](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/).

## 6. Domain

**Done — 2026-09-25.** `wagon-wise.com`, `.co.uk` and `.app` bought via Spaceship. The UK IPO
trademark search flagged below also came back clear, so the working-name caveat that used to
live here (and in `docs/progress.md`'s decisions log) is resolved — see that file for the
final note.

Using `.co.uk` for the deployed app (`api.wagon-wise.co.uk` for `driver-bff`, once DNS is
live), keeping `.com`/`.app` spare for later (marketing site, universal redirect). DNS: rather
than juggling records at Spaceship, nameservers are being pointed at DigitalOcean
(`ns1/ns2/ns3.digitalocean.com`) so DNS lives in the same place as everything else — Spaceship
warns this deactivates (not deletes) any existing records there, which was fine since nothing
was live on the domain yet. Propagation can take up to 48 hours.

<details>
<summary>Original research (kept for context — the trademark question this answered)</summary>

A quick informal web search this session found no existing app or company called
"WagonWise", but did turn up an unrelated "WAGON" trademark (Wagon, Inc., filed 2014)
covering transportation-coordination software — adjacent, not identical, close enough to be
worth a real UK IPO search given the app is UK-focused. That search has now been done and
came back clear.

</details>

## 7. What's actually deployed, and four real bugs found getting there

Moved to `docs/history/deployment-first-deploy.md` (2026-11-09): what was provisioned on 2026-09-25, how it was verified end to end, and the four bugs found on the
first deploy. Worth reading if a deploy fails in a way the steps above do not explain; one of its notes (re-recording the golden routes after a routing change) is still relevant.

## 8. Valhalla: lift the trace limits (after the 2026-10-03 routing change)

Each route is now chosen with `/route` and then timed with `/trace_route` (README, "How a route is
chosen and timed"). Valhalla's defaults only let `/trace_route` take a path up to 200 km and 16,000
points (`service_limits.trace.max_distance` and `max_shape` in `valhalla.json`). Beyond that the
time silently falls back to the uncapped time times 1.17, which is fine but less accurate, and
lorry journeys are often longer than 200 km. On the Valhalla droplet, in the `valhalla.json` the
container uses, set for example:

```json
"service_limits": { "trace": { "max_distance": 1000000, "max_shape": 100000 } }
```

Then restart the container. Nothing breaks if this is skipped.

**Done on the live server 2026-10-16:** `trace.max_distance` is 2,000,000 m and `trace.max_shape` 250,000 (a copy of the file before the change is `/opt/valhalla/custom_files/valhalla.json.before-trace-limits`). Before it, a path over about 16,000 points (Penzance to Wick is one) was timed by the fallback, which came out slightly faster than the speed cap allows; it is now timed properly (14 h 14 min, an average of 86 km/h). Keep these limits in any `valhalla.json` copied to a new serving droplet: a freshly built `valhalla.json` has the defaults.

## 9. Automated app releases (the driver app to Google Play)

**Merging to `main` never releases the driver app by itself. The `release` label does.**
`.github/workflows/driver-app-release.yml` ("Driver app release") publishes the driver app to production
when a pull request carries the **`release`** label:

- labelled **before** it merges: it releases when it merges, if CI passed on the pull request;
- labelled **after** it merged: it releases `main` as it is now, if CI passed on that pull request. (CI no longer runs again on `main` after a merge, to save Actions minutes.)

"Release" always means "publish `main` as it is now", never an older commit (an older over-the-air update
published after a newer one would undo it). What goes out is **everything on `main` since the last release**,
so earlier unlabelled merges ride along; the run summary lists them. The last release is recorded by the git
tag **`driver-app/production`**, which the workflow moves after each successful release.

What it publishes (decided by `.github/scripts/release-decision.mjs`, tested by `pnpm test:ci-scripts`):

| Since the last release                                                               | What happens                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `release` label                                                                   | Nothing. The run summary says how to release.                                                                                                                                    |
| Nothing changed in `apps/driver-app` or `packages/contracts` (tests, `.md` excluded) | Nothing.                                                                                                                                                                         |
| App changed, `version` in `apps/driver-app/app.config.ts` unchanged                  | `eas update` to the production channel, after waiting for the live server to have the routes the app needs (below).                                                              |
| App changed, `version` higher than at the last release                               | `eas build --platform android --profile production --auto-submit`: builds, then uploads to Play's **internal testing** track. Promoting it is a deliberate step in Play Console. |

Raise `version` for any native change (a new package, a plugin, permissions, a new Expo version); the run
warns if native-looking files changed without it. It can also be run by hand (Actions, Driver app release,
Run workflow): **check** proves the secrets work and publishes nothing; **update** and **build** release
regardless of the label, and are how the **first** release creates the tag.

**Setup, once (only the owner can do these).**

1. An Expo access token (expo.dev, Account settings, Access tokens) as the GitHub secret `EXPO_TOKEN`.
2. A Google Play **service account**: create it in Google Cloud (enable the Google Play Android Developer
   API, create the account, add a JSON key), invite its email in Play Console under Users and permissions
   with **Release to testing tracks** for the app, and store the whole JSON as the GitHub secret
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
3. The GitHub label `release` (already created) and the baseline tag `driver-app/production` (already
   pushed, at the last commit published by hand: `2bb0779`, app 1.1.0).
4. Run the workflow once with mode **check**; it shows the service account's email to compare with the
   one invited in Play. Until the secrets exist a labelled release is skipped with a note, not failed.

**Waiting for the server.** An update reaches phones within minutes, while the server deploys separately
(a route the app calls may not exist yet, which nearly broke "Start" for every driver). Before publishing,
the workflow polls the live API until every line in `.github/release/api-checks.txt` answers as listed
(`METHOD /path STATUS`, unauthenticated, so an existing route answers 401 and a missing one 404), for up to
20 minutes, and publishes nothing if it never does. **Add a line there whenever an app change needs a new
server route.**

**Things to know.** Adding the label to a merged pull request checks that CI is green on `main`'s latest
commit first; if it is not, nothing is published, and removing and re-adding the label retries. The Google
key is written to `apps/driver-app/google-play-service-account.json` for the build step only and removed
afterwards (git-ignored, referenced by `eas.json`'s submit profile). Releases run one at a time and are never
cancelled half way. A bad over-the-air update can be rolled back from the Expo dashboard; a bad native build
can only be superseded by a higher version. There is no staging copy of the app: a change is verified by CI
and then goes to drivers when labelled. iOS is not included yet (see section 9c).

## 9c. iPhone: the first TestFlight build

Enrolment as an organisation (WagonWise Ltd) was submitted on 2026-10-24 and approved on 2026-10-28; the owner paid the fee. The
**Team ID** is `5FW3CVS33S` (Membership details on developer.apple.com; it is safe to share, a password is not) and is set in
`apps/driver-app/eas.json` under `submit.production.ios.appleTeamId`. The app's iPhone settings are in `app.config.ts` (bundle id
`com.wagonwise.driverapp`, permission wording, no tablet support, the export-compliance answer). Steps, in order:

1. **App Store Connect** (appstoreconnect.apple.com, same Apple Account): My Apps, New App. Platform iOS, name WagonWise, primary
   language English (UK), the bundle id above (it appears in the list once EAS has registered it in step 2; do step 2 first if it
   does not), any SKU (for example `wagonwise-driver`).
2. **Build.** On the owner's machine, in `apps/driver-app`: `eas build -p ios --profile production`. EAS asks the owner to sign in
   to Apple (password and the two-factor code: only the owner can answer them) and offers to manage the certificates and
   provisioning profile: say yes. About 15 to 30 minutes. `autoIncrement` raises the build number each time.
3. **Send it to TestFlight:** `eas submit -p ios --latest`. The first time it asks for the App Store Connect app (or its numeric
   id, which can then be added to `eas.json` under `submit.production.ios.ascAppId`).
4. **TestFlight.** Apple processes the build for 10 to 30 minutes. Internal testers (people added to the team in App Store Connect,
   up to 100) can install straight away; external testers need the first build to pass Beta App Review (usually a day) and can then be
   added by email or a public link.
5. **Store release** later needs: screenshots, the privacy answers (location, email), the age rating, and review notes with a login
   Apple can use (the reviewer mailbox described in `play-store-listing.md`).

Things to know. The JavaScript is shared, so the over-the-air updates (`driver-app-release.yml`) reach iPhones that have a build
of the same `version` without a new build; only native changes need one. Voice reporting (speech recognition) and the push
notifications have never been tried on an iPhone, so test those first. If Apple rejects the build or the app, the message is in
App Store Connect and by email.

## 9a. Telling drivers a new build is out

The driver app asks the driver BFF `GET /app/version` (no sign-in) when it opens and when it comes back to the front, and shows a banner if its own version is older. Over-the-air updates are different: they download in the background and the banner says "An update is ready. Restart". Only a **new build** (a store release with a new version number) needs the setting below, because a driver on 1.2.1 never receives an over-the-air update made for 1.3.0; the store is the only way they get it.

Set these on the **driver-bff** component in DigitalOcean (plain, non-secret variables; none is needed for the app to work, and nothing is said while they are unset):

- `APP_LATEST_VERSION`: the newest version in the store, for example `1.3.0`. Drivers on an older one see "A new version is available" with Update and Not now. Set it when the new build is available to testers, not before.
- `APP_UPDATE_URL`: where Update goes: the Play listing or the internal testing link.
- `APP_MINIMUM_VERSION`: leave unset. Setting it covers the screen of anyone older with "Please update WagonWise", so use it only to force an update (for example when an old build can no longer talk to the server). A value that is not a plain version number such as `1.3.0` is ignored, so a typo cannot lock anyone out.

## 9b. Telling the owner when a sign-in email fails

Resend can call a web address whenever an email fails, bounces, is marked as spam or is suppressed. The driver BFF receives it at `POST /webhooks/resend`, checks Resend's signature (nothing is read without a valid one), and passes it to core, which logs it (with the address masked, like `d***@gmail.com`) and emails the owner. At most 5 alert emails go in an hour, and an email to the alert address itself is never alerted about, so a failing alert cannot start a loop. The full address is in the Resend dashboard under the email's id, which the alert includes.

Nothing is needed in the routing: `api.wagon-wise.co.uk` already sends everything except `/staff/*` to the driver BFF, which is where this route is.

Set up, in this order:

1. **Core:** add `ALERT_EMAIL` (a plain variable) with the address alerts should go to. Unset, problems are only logged.
2. **Resend dashboard → Webhooks → Add endpoint:** the URL is `https://api.wagon-wise.co.uk/webhooks/resend`. Choose the events for a failed, bounced, complained and suppressed email (`email.failed`, `email.bounced`, `email.complained`, `email.suppressed`; the dashboard shows the exact names). Save, then copy the **signing secret** (it starts `whsec_`).
3. **driver-bff:** add `RESEND_WEBHOOK_SECRET` as an **encrypted** variable with that secret, and redeploy. Until it is set, the route answers 503 ("not set up") and Resend will keep retrying and may mark the webhook as failing, so do steps 2 and 3 together.
4. **Test it:** send a test event from the Resend webhook page, or an email to one of Resend's test addresses for a bounce (their docs list them). The owner should get an alert and core's log should show "an email did not get through".

The secret and the alert address are read only in each app's `config.ts`. Nothing is stored: the events are logged and emailed, not kept.

## 10. Valhalla: covering the whole of Great Britain (done 2026-10-16)

**What was done, and where things are now.** The tiles were built on a temporary 16 GB / 8 vCPU droplet (`s-8vcpu-16gb`, London, in the wagonWise project, deleted afterwards): the Geofabrik Great Britain extract (2.2 GB) downloaded in a few minutes and the whole build took 1 hour 17 minutes with no out-of-memory problem (the memory sampler wrote blanks, so the exact peak is unknown; 16 GB was enough). The tile archive is 2.65 GB (`valhalla_tiles.tar`; the config reads it through `tile_extract`). The serving droplet `wagonwise-valhalla-lon1` was resized to `s-4vcpu-8gb` (8 GB, 4 vCPU, 160 GB disk). Valhalla there loaded the archive in under 15 seconds. The new tiles were copied into `/opt/valhalla/custom_files-gb`, checked by SHA-256, and swapped in by renaming; the **north-east tiles are kept at `/opt/valhalla/custom_files-ne-backup`**.

**The live `valhalla.json` was kept, not the freshly generated one:** it carries the raised limits from section 8. The swap was: `docker compose stop`, `mv custom_files custom_files-ne-backup`, `mv custom_files-gb custom_files`, `cp custom_files-ne-backup/valhalla.json custom_files/valhalla.json`, `docker compose up -d`. **To roll back:** stop, swap the folder names back, start. Delete `custom_files-ne-backup` only once you are sure.

**Checked on the server after the swap (truck costing, a 4 m, 2.55 m, 16.5 m, 40 t vehicle):** Penzance to Wick 1,307 km (12 h 35), London to Edinburgh 602 km, Cardiff to Inverness 886 km, Hexham to Hebburn 53 km. The nightly golden-route workflow builds its own Northumberland copy and is not affected. Still to do: add golden routes beyond the north-east and re-record them, and a rebuild about monthly (the same steps).

**Golden routes for Great Britain:** `pnpm --filter @wagonwise/core test:golden:gb` runs 12 long and awkward truck routes (Penzance to Wick, London to Edinburgh, Cardiff to Inverness, Dover to Felixstowe, the Highlands, mid-Wales, the South West, the Pennines, a dense London route) and checks Northern Ireland is not routed, against the live server, with loose tolerances. It is run by hand after a rebuild or a routing change, not nightly (the national graph is too big for a CI machine). The routing server has no public address, so open a tunnel first: `ssh -N -L 8003:<serving droplet private IP>:8002 root@<serving droplet public IP>` (both addresses are on the droplet's page in DigitalOcean). After a deliberate change, the run prints `golden actual:` lines to check and re-record in `valhalla-routing-engine.golden-gb-test.ts`.

The original plan follows, for the next rebuild.

Until 2026-10-16 Valhalla covered Northumberland, Tyne and Wear and Cumbria on a 2 GB droplet. National
coverage (Great Britain; **Northern Ireland is deliberately left out for now**) was mostly an infrastructure
job, and is now done as described above. The steps are kept for the next rebuild:

1. **Build the tiles on a temporary big droplet**, not the serving one. The national graph needs very
   roughly 16 to 32 GB of RAM and several cores for a build of a couple of hours; serving it needs about
   8 GB. Create a 16 GB / 8 vCPU droplet in `lon1`, run `infra/valhalla/build-gb-tiles.sh` on it, and
   delete the droplet afterwards (a few pounds). These figures are estimates: check the real peak memory
   on the first build.
2. **Resize or replace the serving droplet** to about 8 GB (`wagonwise-valhalla-lon1`), with 50 GB or more
   of disk (the tiles are a few GB, the extract about 2 GB, and keep the previous tiles for a rollback).
   Check your DigitalOcean account's droplet size limit before the day.
3. **Copy the finished tiles across** (`rsync -a custom_files/ <serving-private-ip>:/path/custom_files-new/`),
   then swap directories, restart the container (it starts with `use_tiles_ignore_pbf=True`, so it uses the
   tiles and does not rebuild) and check `curl http://<private-ip>:8002/status`. Keep the old directory until
   the golden routes pass.
4. **Lift the trace limits** (section 8): for national journeys `max_distance` and `max_shape` matter a lot.
5. **Run the golden-route checks** (`pnpm test:golden`, or the nightly workflow) and add golden routes beyond
   the north-east: the Scottish Highlands, mid-Wales, the South West, London, and a long cross-country
   one (Penzance to Wick). Re-record the golden values after the switch (the note in `docs/history/deployment-first-deploy.md` applies).
6. **Rebuild on a schedule** (about monthly): roads change. The same script, the same copy and swap.

**Not about Valhalla, but needed for long routes (done in code, 2026-10-07):** a route across Britain has tens
of thousands of points. The server used to build lines for its "what is near this route" queries from one
bound value pair per point, which Postgres refuses past about 32,000 points, so planning a long journey would
have failed outright; it now sends the line as one text value (`shared/line-wkt.ts`). The app also thins the
route to 1,500 points before asking about hazards and parking, because the API accepts at most 2,000.

**Still to check on the first national build:** how the route-options preview and parking drive times behave
on long routes (each is a separate routing request), MapTiler plan limits (tiles and address search) at national
usage, and OpenStreetMap's height and weight tags on the routes customers actually drive.

## 11. Valhalla: height data for the Loaded hill check (written 2026-11-09, not yet done on the live server)

The Loaded option on Plan route (`docs/loaded-routing-scope.md`) measures hills with Valhalla's `/height` service. That service reads height files from the
folder `valhalla.json` names under `additional_data.elevation` (`/custom_files/elevation_data` in the container), **independently of the road tiles**: no tile
rebuild, no new droplet. Until the files are there, `/height` answers an error, core treats that as "no heights", and the app says the hill check is not
available yet. Nothing else is affected.

**Size, checked 2026-11-09:** Great Britain (latitudes 49 to 60 N, longitudes 9 W to 1 E) is 132 one-degree tiles of NASA SRTM data from the public AWS
terrain tiles: 345 MB to download and **about 3.4 GB unpacked** (each tile is a 3601 by 3601 grid, about 26 MB; the 160 GB disk has room). The download is checked
on one tile (N55W003): Carter Bar reads 404 m from it, against about 418 m on the map. Do it on the serving droplet, `wagonwise-valhalla-lon1`.

All commands below run **on the serving droplet** (`ssh root@<serving droplet public IP>`, the address on its DigitalOcean page), in `/opt/valhalla`.

1. **Check the config names the folder, and the height limits.**

   ```bash
   cd /opt/valhalla
   grep -n '"elevation"' custom_files/valhalla.json
   grep -n -A3 '"height"' custom_files/valhalla.json
   df -h /opt
   ```

   The first should show `"elevation": "/custom_files/elevation_data"`. If it shows an empty string or nothing, set it to that value under
   `"additional_data"` (take a copy of the file first: `cp custom_files/valhalla.json custom_files/valhalla.json.before-elevation`). The second may show nothing
   (the defaults apply, which are enough: a route is thinned to 20,000 points before it is sent). `df` should show at least 5 GB free.

2. **Download the tiles.** Each is named for its south-west corner (`N54W002` is 54 to 55 N, 2 W to 1 W) and sits in a folder named for its latitude.

   ```bash
   mkdir -p custom_files/elevation_data && cd custom_files/elevation_data
   for lat in $(seq 49 60); do
     mkdir -p "N$lat"
     for lon in $(seq -9 1); do
       if [ "$lon" -lt 0 ]; then ew=W; a=$((-lon)); else ew=E; a=$lon; fi
       name=$(printf "N%02d%s%03d" "$lat" "$ew" "$a")
       curl -fsS --retry 5 --retry-delay 2 --retry-all-errors -o "N$lat/$name.hgt.gz" "https://elevation-tiles-prod.s3.amazonaws.com/skadi/N$lat/$name.hgt.gz" && gunzip -f "N$lat/$name.hgt.gz"
     done
   done
   find . -name '*.hgt' | wc -l
   du -sh .
   cd /opt/valhalla
   ```

   It takes a few minutes. The count should be **132** and the size about 3.4 GB. A line starting `curl:` means a tile failed: run the loop again (tiles already unpacked are
   downloaded again, which does no harm).

3. **Restart Valhalla** so it opens the files, and wait for it to answer.

   ```bash
   docker compose restart valhalla
   until curl -fs http://localhost:8002/status >/dev/null; do sleep 2; done; echo up
   ```

   If the service has another name in this folder's compose file, `docker compose ps` shows it. Loading the road tiles takes under 15 seconds (section 10).

4. **Check heights.** The first point is the top of the A68 at Carter Bar; the second is a few km along the road.

   ```bash
   curl -s http://localhost:8002/height -H 'content-type: application/json' \
     -d '{"range":true,"resample_distance":100,"shape":[{"lat":55.3526,"lon":-2.4778},{"lat":55.3300,"lon":-2.5000}]}'
   ```

   Good: a `range_height` list of `[distance, height]` pairs, the first height near 400 (404 from the data, 418 on the map). Bad: an error mentioning elevation (the folder or the config is wrong:
   repeat step 1), or heights of 0 or `null` (tiles missing: repeat step 2).

5. **Try it in the app.** Once the server side and the app switch are released (PRs #347 and #349), open Plan route, choose **Loaded**, and plan Washington to
   Grangemouth with a heavy artic. The route cards should show "of steep hill · highest point" lines. A loaded search makes several routing requests, so it takes a few
   seconds.

**Roll back:** `rm -rf custom_files/elevation_data` and `docker compose restart valhalla`. The app goes back to "the hill check is not available yet". Keep this folder
when swapping in new road tiles (section 10): it is not part of them.
