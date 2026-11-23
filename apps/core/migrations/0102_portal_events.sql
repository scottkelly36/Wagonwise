-- Which pages a company's staff open in the portal and where its forms trip them up (docs/company-account-states-scope.md, "Portal
-- tracking"), so the portal can be improved and a firm that stopped part-way can be rung. First party only. Names, never content: the
-- page, form, field and problem are checked against fixed lists before they get here (packages/contracts usage.ts), so nothing anyone
-- typed can be stored. The company is kept (that is the point for a firm on a trial); the person is not: only a random session id made
-- in the browser when the portal opens. Kept 90 days at most: an hourly task deletes older rows.
--
-- Written in the signed-in person's own scope (a company can only add rows for itself) and read only by WagonWise staff.

create table usage.portal_events (
  id uuid primary key,
  company_id uuid not null,
  session_id uuid not null,
  event text not null check (event in ('page_viewed', 'form_opened', 'form_sent', 'form_left', 'form_error')),
  page text check (page is null or char_length(page) between 1 and 30),
  form text check (form is null or char_length(form) between 1 and 30),
  field text check (field is null or char_length(field) between 1 and 20),
  problem text check (problem is null or char_length(problem) between 1 and 20),
  at timestamptz not null
);
create index portal_events_at_idx on usage.portal_events (at);
create index portal_events_company_idx on usage.portal_events (company_id, at desc);

alter table usage.portal_events enable row level security;
create policy platform_all on usage.portal_events
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
create policy company_add on usage.portal_events for insert
  with check (company_id = public.rls_company_id());
