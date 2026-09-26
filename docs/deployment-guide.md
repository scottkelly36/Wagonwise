# Deployment guide (M8 spike, 2026-09-25)

How to get `core` and `driver-bff` reachable from outside the dev machine, on DigitalOcean.
This is the missing piece behind M5.10's "EAS Build → TestFlight + Play internal" and M8's
"first driver onboarded" — a tester on their own network can't reach `192.168.1.50:3002`.

**Status: live.** Deployed and verified end to end 2026-09-25 —
`https://wagonwise-backend-o2baa.ondigitalocean.app` answers `/health`, and a real
`POST /identity/otp/request` round-tripped driver-app-shape request → `driver-bff` (public) →
`core` (private VPC) → Postgres → a real ClickSend SMS, delivered. See §4 for what's actually
provisioned and §7 for three real bugs found getting here.

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
5. Valhalla only has the **Northumberland extract** — correct for the Hexham test area, but a
   reminder this isn't a UK-wide deployment.

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
     `ANTHROPIC_API_KEY`, `CLICKSEND_USERNAME`, `CLICKSEND_API_KEY`, `RESEND_API_KEY`,
     `NODE_ENV=production`.
   - `driver-bff`: public route on your domain. Env: `CORE_INTERNAL_URL=http://core:3001`,
     `CORE_INTERNAL_KEY` (must match one of `core`'s `INTERNAL_KEYS`), `NODE_ENV=production`.
   - Basic containers, $5/mo each, to start.
   - **`migrate` job (`kind: PRE_DEPLOY`), added 2026-09-26.** Same image as `core`, entrypoint
     overridden to `pnpm --filter @wagonwise/core run db:migrate`. DO runs this once before
     swapping in a new `core`/`driver-bff` deploy; if it fails (a bad migration), the deploy
     aborts and the previous version keeps serving traffic — migrations no longer need a manual
     `pnpm db:migrate` run after every deploy that adds one. One manual step the first time: give
     this job its own `DATABASE_URL` env var (DO console → the `migrate` job's "Environment
     variables" panel, or `doctl apps update`) — job components don't inherit another
     component's env vars, even within the same app, so `core`'s existing `DATABASE_URL` doesn't
     carry over automatically. Everything else `config.ts` reads is optional/defaulted, so this
     job needs nothing beyond that one value. Applying the updated spec itself (`doctl apps
update <app-id> --spec infra/digitalocean/app-spec.yaml`) is also a one-time step.
5. **Domain — not needed for this week's goal** (§0, §6). App Platform's own
   `*.ondigitalocean.app` URL already has a managed TLS cert and works fine to start; point a
   real domain at it later once one's bought and the trademark check (§6) is done.
6. **Driver app**: set `EXPO_PUBLIC_BFF_URL` to the App Platform URL (`https://<something>
.ondigitalocean.app` for now, a real domain later) in the EAS `preview` build profile
   (`apps/driver-app/eas.json`) — that's the profile actually used for sideloaded personal
   testing right now; switch `production`'s to match once a Play Store submission is real.
7. ~~Decide on the `OtpSender` gap~~ — resolved same day (§2.1): `ClickSendOtpSender` is live
   and its env vars are set on `core`.

## 5. Pricing (DigitalOcean, starting tiers)

| Item                        | Tier                               | Monthly     |
| --------------------------- | ---------------------------------- | ----------- |
| App Platform — `core`       | Basic, 1 vCPU shared / 512 MiB     | $5          |
| App Platform — `driver-bff` | Basic, 1 vCPU shared / 512 MiB     | $5          |
| Managed PostgreSQL          | Standard single-node, 1 GiB        | $15         |
| Droplet — Valhalla          | Basic, 2 GiB / 1 vCPU / 50 GiB SSD | $12         |
| **Total**                   |                                    | **~$37/mo** |

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

## 7. What's actually deployed, and three real bugs found getting there

**Provisioned (2026-09-25):**

- Managed PostgreSQL `db-pgsql-lon1-09118`, PostgreSQL 17, PostGIS 3.6 enabled, all 11
  migrations applied.
- Droplet `wagonwise-valhalla-lon1` (2 GiB), Docker + the same `valhalla` service definition
  as `infra/docker/compose.yml`, Northumberland extract, tiles built and healthy. Port 8002 is
  bound to the droplet's **private** IP only (`10.131.30.167:8002` in the compose file, not
  `0.0.0.0`) — publishing on `0.0.0.0` and relying on `ufw` to block the public IP does **not**
  work, because Docker writes its own iptables rules that bypass `ufw` entirely for published
  ports. Verified both ways: public IP times out, private IP responds.
- App Platform app `wagonwise-backend` (ID `dcbd23e5-6de6-44b8-90b8-32e162e99016`), created via
  `doctl apps create --spec infra/digitalocean/app-spec.yaml` (`doctl`, not the web console —
  the visual builder couldn't be made to use a Dockerfile instead of Buildpack detection, and
  this DO account's UI has no "edit as YAML" option to work around it). Live at
  `https://wagonwise-backend-o2baa.ondigitalocean.app`.

**Three real bugs found only by actually deploying, not by local testing:**

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

**Verified end to end**, not just "deployed and hoped": `GET /health` on the public URL, then a
real `POST /identity/otp/request` (driver-app request shape, a temporary test invite code
inserted directly via SQL and removed after) round-tripped `driver-bff` → `core` over the
private VPC → Postgres → a real ClickSend SMS, delivered to a real phone.
