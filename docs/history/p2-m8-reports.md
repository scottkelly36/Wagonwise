# P2-M8: reports and CSV export

Added 2026-10-08.

## What it does

The dashboard's **Reports** page (Fleet section) shows the jobs with any activity in a chosen period and
lets the viewer download them as a CSV. Periods: last 7 days, last 30 days, this month, last month, or custom
dates (both days included). The period is in the viewer's own time zone.

"Any activity" means a status change in the period (created, assigned, accepted, delivered, cancelled), so a job
created last week and delivered today appears in both weeks' reports, and one still going appears while it is worked.

Summary: jobs in the period, delivered, delivered on time against late (only jobs with a due time), average
accepted-to-delivered time, cancelled or failed, still in progress, and proof-of-delivery photos received against
required. Table: job, status, pickup and delivery, driver, vehicle, created, delivered, time taken, on time, proof.

## How it is built

- **Core** (`jobs` module): `domain/report.ts` works each job's milestones out of its status timeline (pure, tested);
  `application/report-jobs.ts` filters by period, looks up each driver's sign-in and each vehicle's name once, and
  summarises; `POST /staff/jobs/companies/:companyId/report` with `{ from, to }`. A POST because the staff BFF's
  forwards carry a body, not a query string.
- **Permission:** `view_reports` for the company, or a WagonWise admin (`canViewReports`). Viewing jobs needs no
  privilege; the report holds the whole history including who drove what, so it is a step beyond. Checked in core;
  the page only hides itself.
- **Names** are resolved by core (driver identifier from identity, vehicle name from fleet, through ports supplied by
  composition), so a person with only `view_reports` still sees them.
- **CSV** is built in the browser from the same rows (`lib/job-report.ts`): a byte-order mark for Excel, local
  times as `yyyy-mm-dd hh:mm`, and any cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe, because
  references and stop names are typed by people and a spreadsheet would otherwise run them as formulas.
- **No migration.** Everything is computed from existing tables.

## Not done

- Distance and fuel (jobs do not record them), per-driver or per-vehicle roll-ups, and a scheduled emailed report.
- A paged server query: the report loads every job in the period. Fine for a pilot's volumes; add paging if a company
  has thousands of jobs a month.
