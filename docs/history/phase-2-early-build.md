# Phase 2, how it was built early (to 2026-10-08)

Moved out of `docs/progress.md` to keep that file short. What was built ahead of the Phase 2 plan, and what the early
milestones (P2-M1 to P2-M4) delivered. Open it only when working on those areas. The newer entries are in `log.md`.

Plan: the [Phase 2 tech design doc](https://claude.ai/artifact/LK2oYrVSwotj7E8W9tXykD)
(milestones P2-M1 … P2-M9, decision log). Built early, ahead of its sequencing, because an admin
surface was needed straight away:

- `apps/dashboard` (Vite + React). Since P2-M1.12c it uses staff accounts only (email,
  password, second factor) through `apps/staff-bff`.
- `companies` module (own migration).
- Admin screens: Companies, Invite Codes (generate/list), Hazard Reports (list/delete —
  replaced the driver app's delete button).

- **Fleet vehicles (PR #48, early P2-M2):** `fleet` module (company vehicles with dimensions,
  migration 0019), Vehicle Profiles page. Its interim driver `scopes` were replaced by staff
  privileges at P2-M1.12c (migration 0025 drops them).

- **Driver links (P2-M2.1-2.8, done 2026-10-02):** `fleet.driver_links` + `fleet.company_codes`
  (migration 0028) — a driver joins a company by invite or company code, staff approve, and a
  driver can be active with several companies at once. Staff routes + the dashboard's Drivers
  page (M2.6), driver app screens (M2.7), and the cut-over (M2.8: jobs reads active links
  instead of the old single `drivers.company_id`, which migration 0029 then drops, along with
  the driver-accounts admin screen). See `history/p2-m2-driver-links.md`.

- **Jobs — P2-M3 (done 2026-10-02):** `jobs` module (migrations 0026-0027). The `Job` model with a
  forward-only status machine (draft → assigned → accepted → at pickup → loaded → en route → at
  delivery → delivered, plus cancel and fail), and create / list / get / assign / advance /
  cancel / fail as use cases and staff routes under `/staff/jobs/*` (gated by the `dispatch`
  privilege). A driver can be on one active job at a time (checked in `assignJob`, and backed by a
  partial unique index). `JobCreated`, `JobAssigned`, `JobStatusChanged`, `JobCompleted` and
  `JobCancelled` go to the outbox; nothing handles them yet (the push to the driver is M5).
  Driver and vehicle must belong to the job's company, read through jobs' own directory ports
  (driver via `fleet.driver_links`' active status, since P2-M2.8; originally the single
  `drivers.company_id`). Deliberately **not** in M3: route planning from the vehicle's dimensions on assign
  (routing only plans from a driver's own profile today, so it needs a routing change, still not
  done), the driver's own endpoints and the driver-bff proxy (M5). `composition/jobs-dispatch-end-to-end.test.ts`
  runs the whole flow as `wagonwise_app` under real RLS and `DataScopes`.

- **Jobs in the portal — P2-M4 (done 2026-10-02):** the dashboard's new Jobs page
  (`pages/fleet/Jobs.tsx`) — list, create (one pickup + one delivery stop), assign a driver and
  vehicle, cancel — over five new staff-bff forwards onto P2-M3's existing routes. Anyone at the
  company can see the list; creating, assigning and cancelling need `dispatch`. See
  `history/p2-m4-portal-jobs.md`. Not done: route preview before assigning (design doc §5 step 2,
  needs the routing change noted above), multi-stop jobs, a job detail/status-timeline view.

Staff accounts, RLS, staff auth + 2FA are P2-M1 (above). Not built: the rest of Phase 2 (dispatch,
live map, moderation, reports).
