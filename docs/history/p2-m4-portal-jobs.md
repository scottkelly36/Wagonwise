# P2-M4: jobs in the portal

Scoped 2026-10-02 from the Phase 2 tech design doc's milestone table ("Staff BFF + portal shell,
job list, create/assign job"). **Status: done, 2026-10-02.**

## What was already there

P2-M1 (staff-bff + the dashboard, ahead of sequencing) and P2-M3 (`jobs` module: domain, use
cases, staff routes under `/staff/jobs/*`, gated by the `dispatch` privilege) meant the "portal
shell" and "staff BFF" halves of this milestone's title were already built. What was missing was
the dashboard's own Jobs screen and the staff-bff forwards to reach it — the slice this milestone
actually added.

## What this milestone added

- `apps/staff-bff/src/dashboard-routes.ts`: five forwards onto the existing core routes — list and
  create for a company's jobs, get/assign/cancel for one job. Same declarative forward-table
  pattern as fleet's and companies' own routes (contract-validated params/body, core's answer
  relayed unchanged). Job status advance and fail stay driver-app territory (M5) — not forwarded.
- `apps/dashboard/src/api/jobs.ts`: a thin client over those forwards, mirroring `api/fleet.ts`.
- `apps/dashboard/src/pages/fleet/Jobs.tsx`: the screen. Company picker for WagonWise admins
  (`canViewJobs` needs no privilege, so anyone at the company sees the list); create-job form and
  the assign/cancel actions only show for `dispatch`. One pickup and one delivery stop (name +
  lat/lon) — multi-stop routes and a map pin picker are later nice-to-haves, not needed for a
  first pilot firm's jobs.
- Nav entry under "Fleet" → "Jobs", route `/fleet/jobs`.
- Error messages for the jobs module's tags (`InvalidStops`, `DriverBusy`, `VehicleNotInCompany`,
  etc.) added to `pages/staff/messages.ts`.

## Verified

- `pnpm verify` green (1004 core tests, 99 staff-bff tests including 54 forward-table cases,
  arch, format).
- Live end-to-end: bootstrapped a WagonWise admin locally, created a company and a vehicle, and
  created a job through the real Jobs screen against core + staff-bff + Postgres — list, create,
  and the assign/cancel UI all render and call the right routes (checked via the browser's network
  log, all 200/201s). Assigning a driver wasn't exercised live (needs a driver app sign-in to
  create an active driver link), but `assign-job.test.ts` and `jobs-dispatch-end-to-end.test.ts`
  already cover that path against real RLS.

## Deliberately not done

- Multi-stop jobs, a map pin picker for stop locations, `plannedStart`/`dueBy` in the form.
- Route preview (restrictions/hazards shown before assigning) — design doc §5 step 2; needs
  routing wired to a company vehicle's dimensions, not scoped here.
- Job detail view, status timeline, or any status-advance/fail actions from the portal.

## Follow-up: postcodes instead of coordinates (2026-10-03)

The first version asked the dispatcher for each stop's latitude and longitude, which nobody at a
haulage firm has to hand. The form now takes a **postcode** per stop (stop name stays separate).

- **postcodes.io**, free and keyless, called from the browser the same way the driver app calls
  MapTiler (`lib/postcodes.ts`, `hooks/use-postcode.ts`). It returns the centre of the postcode's
  few dozen addresses, enough to route to a yard, not a gate-level pin.
- **A live hint under each field** shows the resolved place ("✓ Hexham, Northumberland") so a typo
  that is itself a real postcode gets noticed before a driver is sent there. Submit resolves both
  postcodes again (cached, so free) rather than trusting the hint, so a quick click can't outrun it.
- **The dashboard gets its first test runner** (`vitest`, `pnpm --filter @wagonwise/dashboard
test`) for the pure lookup logic.
- **Not done:** what3words (paid API key and an account only the owner can create; worth it for
  farms and quarries without a useful postcode), address search like the driver app's (would need a
  MapTiler key in the dashboard), and a map pin picker. A postcode with no point, or a stop with no
  postcode at all, can't be entered.
