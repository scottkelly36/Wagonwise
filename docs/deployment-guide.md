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
  **Superseded 2026-09-26**: expanded to Northumberland + Tyne and Wear + Cumbria, still not
  UK-wide — see §7's provisioned list.

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

| Piece                     | Needs hosting? | Notes                                                     |
| ------------------------- | -------------- | --------------------------------------------------------- |
| `apps/core`               | Yes            | Private only — never reachable from outside               |
| `apps/driver-bff`         | Yes            | The one public HTTP surface                               |
| Postgres + PostGIS        | Yes            | Currently `infra/docker/compose.yml`'s local container    |
| Valhalla                  | Yes            | Currently local, Northumberland extract only              |
| MapTiler (map tiles)      | No             | Already a hosted SaaS, just needs the API key set         |
| Anthropic (voice parsing) | No             | Already a hosted SaaS, just needs `ANTHROPIC_API_KEY` set |
| Expo Push                 | No             | Already a hosted SaaS                                     |

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
2. **`IDENTITY_PRIVATE_KEY` must be set for real.** Unset, core generates a fresh Ed25519 key
   at every boot — fine for dev (a restart just invalidates sessions), not for anything meant
   to stay up. Generate one PKCS8 PEM and set it as a secret.
3. **`INTERNAL_KEYS` / `CORE_INTERNAL_KEY` must be a real shared secret**, not the
   `local-dev-internal-key` default both sides fall back to.
4. **`ANTHROPIC_API_KEY` must be set**, or voice reports silently degrade to
   `NullHazardParser` (every transcript filed as type `other` with itself as the note).
5. Valhalla covers **Northumberland, Tyne and Wear and Cumbria** (expanded 2026-09-26 from
   Northumberland alone) — correct for the Hexham test area and its surrounding counties, but a
   reminder this isn't a UK-wide deployment yet.

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
    └─────────────────────┘          │  (Northumberland tiles,
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
     `ANTHROPIC_API_KEY`, `METOFFICE_API_KEY` (weather warnings; optional), `CLICKSEND_USERNAME`, `CLICKSEND_API_KEY`, `RESEND_API_KEY`,
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

**Provisioned (2026-09-25):**

- Managed PostgreSQL `db-pgsql-lon1-09118`, PostgreSQL 17, PostGIS 3.6 enabled, all 11
  migrations applied.
- Droplet `wagonwise-valhalla-lon1` (2 GiB), Docker + the same `valhalla` service definition
  as `infra/docker/compose.yml`. **Expanded 2026-09-26** from Northumberland alone to
  Northumberland + Tyne and Wear + Cumbria — Valhalla's `docker-valhalla` image builds tiles
  from every `.osm.pbf` in `/custom_files` together (its own tooling discourages this over
  merging into one file first via `osmium merge`, but three adjacent-county extracts stitched
  correctly at every tested boundary: Tyne and Wear↔Northumberland, Cumbria↔Northumberland, and
  a route crossing both borders at once — worth revisiting with a real merge if a future route
  near a boundary looks wrong). Tiles built and healthy. Port 8002 is bound to the droplet's
  **private** IP only (`10.131.30.167:8002` in the compose file, not `0.0.0.0`) — publishing on
  `0.0.0.0` and relying on `ufw` to block the public IP does **not** work, because Docker writes
  its own iptables rules that bypass `ufw` entirely for published ports. Verified both ways:
  public IP times out, private IP responds.
- App Platform app `wagonwise-backend` (ID `dcbd23e5-6de6-44b8-90b8-32e162e99016`), created via
  `doctl apps create --spec infra/digitalocean/app-spec.yaml` (`doctl`, not the web console —
  the visual builder couldn't be made to use a Dockerfile instead of Buildpack detection, and
  this DO account's UI has no "edit as YAML" option to work around it). Live at
  `https://wagonwise-backend-o2baa.ondigitalocean.app`.

**Four real bugs found only by actually deploying, not by local testing:**

1. **`DeployContainerHealthChecksFailed` on both components.** DO's default health check
   probes `/`; neither `core` nor `driver-bff` has a route there, only `/health`. Fixed with
   `health_check: { http_path: /health, port: <3001|3002> }` in the app spec. Worth adding to
   both apps' Dockerfiles/specs as a standing convention if a third service ever joins this
   deployment.
2. **`core` and `driver-bff` both listen on `127.0.0.1` by default** (`config.ts`'s `HOST`
   default) — fine for local dev, but App Platform's health-check probe connects to the
   container's real network IP, not loopback, so it got `connection refused` even though the
   process was genuinely running and healthy. Fixed by setting `HOST=0.0.0.0` as an env var on
   both components. This is the same class of issue flagged earlier for LAN device testing
   (`README.md`'s physical-device table) — worth remembering as a recurring gotcha, not a
   one-off.
3. **`core` couldn't reach the Valhalla droplet's private IP at all — every
   `POST /routing/route-plans` timed out after 10s with a 500** (`fetch failed: Connect Timeout
Error`, `10.131.30.167:8002`), even though Valhalla itself was healthy and reachable from the
   droplet's own private IP, and the droplet's `ufw` rule allowed the whole `10.131.0.0/16`
   range. Root cause: the App Platform app was never connected to a VPC — App Platform apps
   only get a route into a datacenter's VPC when the spec says so explicitly; otherwise their
   outbound traffic comes from a separate `100.64.0.0/10` CGNAT range with no path to the
   droplet's `10.131.0.0/16` network, regardless of firewall rules. Fixed by adding a top-level
   `vpc.id` (the `default-lon1` VPC UUID, the same VPC the Valhalla droplet is on) to the app
   spec and reapplying via `doctl apps update --spec`. Verified for real, not just by status
   code: watched `core`'s live logs while retrying "Plan route" in the app and confirmed
   `POST /routing/route-plans` went from a 10.5s timeout/500 to a 292ms **201**.
4. **`doctl apps update --spec infra/digitalocean/app-spec.yaml` wiped `core`'s working
   `DATABASE_URL` and briefly took `core` down (2026-09-26), while adding the `migrate` job.**
   `DATABASE_URL` had been set as an **App-Level Environment Variable** — shared across every
   component, in its own section in the app's Settings, separate from any component's own env
   panel (which is also why it never showed up when looking under `core` specifically while
   troubleshooting this). This repo's checked-in `app-spec.yaml` has no top-level `envs:`
   section at all, by design (no secrets committed, per the file's own header comment) — but
   `doctl apps update --spec` treats the submitted file as the **complete, authoritative** spec,
   not a diff to merge. Applying it wiped the app-level `DATABASE_URL` entirely. `core`'s
   _already-running_ container kept working (it had the value loaded in memory from before), so
   there was no actual outage — but the next deploy's fresh `core` container crash-looped on
   `ECONNREFUSED 127.0.0.1:5432` (Kysely/`pg` falling back to `config.ts`'s local-dev default)
   until the deploy failed and DO kept the old container serving instead. Per-component secrets
   (`driver-bff`'s `CORE_INTERNAL_KEY`, confirmed by testing that internal-auth between a fresh
   `driver-bff` and the old `core` still matched) survived the same `doctl apps update` call —
   only the app-level ones were lost. **Never run `doctl apps update --spec
infra/digitalocean/app-spec.yaml` directly** — it will re-wipe any App-Level environment
   variables that aren't in that file (which is all of them, on purpose). Fetch the live spec
   first (`doctl apps spec get <app-id>`), diff it to find what the checked-in file is missing,
   and apply a merged version instead — or make the change through the console's own spec
   editor, which merges rather than replaces. Once secrets are lost, they need regenerating
   (`IDENTITY_PRIVATE_KEY`/`INTERNAL_KEYS` are just random values with no external dependency —
   losing them only forces every signed-in driver to re-authenticate) or recovering from
   wherever else they might be cached (`apps/core/.env`, in this case, had working copies of
   `CLICKSEND_USERNAME`/`CLICKSEND_API_KEY`/`RESEND_API_KEY` from earlier local testing).

**Verified end to end**, not just "deployed and hoped": `GET /health` on the public URL, then a
real `POST /identity/otp/request` (driver-app request shape, a temporary test invite code
inserted directly via SQL and removed after) round-tripped `driver-bff` → `core` over the
private VPC → Postgres → a real ClickSend SMS, delivered to a real phone.

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

## 9. Automated app releases (the driver app to Google Play)

**Merging to `main` never releases the driver app by itself. The `release` label does.**
`.github/workflows/driver-app-release.yml` ("Driver app release") publishes the driver app to production
when a pull request carries the **`release`** label:

- labelled **before** it merges: it releases when it merges, once CI has passed on `main`;
- labelled **after** it merged: it releases `main` as it is now, once CI has passed on `main`.

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
and then goes to drivers when labelled. iOS is not included (no Apple developer account yet).

## 10. Valhalla: covering the whole of Great Britain (planned for the start of November 2026)

Today Valhalla covers Northumberland, Tyne and Wear and Cumbria on a 2 GB droplet. National coverage
(Great Britain; **Northern Ireland is deliberately left out for now**) is mostly an infrastructure job:

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
   one (Penzance to Wick). Re-record the golden values after the switch (section 7's note applies).
6. **Rebuild on a schedule** (about monthly): roads change. The same script, the same copy and swap.

**Not about Valhalla, but needed for long routes (done in code, 2026-10-07):** a route across Britain has tens
of thousands of points. The server used to build lines for its "what is near this route" queries from one
bound value pair per point, which Postgres refuses past about 32,000 points, so planning a long journey would
have failed outright; it now sends the line as one text value (`shared/line-wkt.ts`). The app also thins the
route to 1,500 points before asking about hazards and parking, because the API accepts at most 2,000.

**Still to check on the first national build:** how the route-options preview and parking drive times behave
on long routes (each is a separate routing request), MapTiler plan limits (tiles and address search) at national
usage, and OpenStreetMap's height and weight tags on the routes customers actually drive.
