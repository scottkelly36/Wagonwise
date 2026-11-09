# The first deployment, and four real bugs found getting there (2026-09-25 onwards)

Moved here from `docs/deployment-guide.md` section 7 on 2026-11-09 to keep the guide under its length limit. It records what was provisioned and the bugs found
on the first deploy; the guide has the current steps.

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
