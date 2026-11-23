-- Whether a person at a company agrees to WagonWise contacting them from time to time to ask for feedback (docs/company-account-states-scope.md,
-- "Market research contact"). An option, never a condition: a company uses WagonWise whatever is chosen here, and nobody is contacted
-- for research unless their latest answer is yes.
--
-- Append-only: every answer is a row, with the date and the version of the wording shown at the time, so it can be shown what a person
-- agreed to. A person's current answer is their latest row. Changing your mind adds a row; it never edits one.

create table feedback.research_consent (
  id uuid primary key,
  staff_id uuid not null,
  company_id uuid not null,
  agreed boolean not null,
  wording_version integer not null check (wording_version >= 1),
  at timestamptz not null default now()
);
create index research_consent_staff_idx on feedback.research_consent (staff_id, at desc);

alter table feedback.research_consent enable row level security;
-- WagonWise staff read every answer (to know who may be contacted); a company's staff add and read only their own company's rows, and the
-- application only ever shows a person their own.
create policy platform_all on feedback.research_consent
  using (public.rls_platform_staff()) with check (public.rls_platform_staff());
create policy company_rows on feedback.research_consent
  using (company_id = public.rls_company_id()) with check (company_id = public.rls_company_id());

revoke update, delete on feedback.research_consent from wagonwise_app;
