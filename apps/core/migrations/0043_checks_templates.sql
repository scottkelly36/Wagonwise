-- Walk-round checks (Phase 3 M5), first slice: each company builds its own check lists. A list is an ordered set
-- of questions (tick or flag a defect, yes or no, a number, a note, a photo). It applies to every vehicle the
-- company has, or only to chosen ones, and a firm that wants no checks simply has none.
--
-- The questions are held as one JSON document with the list: they are always read and replaced together, a
-- driver's answers (a later migration) refer to a question by the id the builder chose, and each check keeps a
-- copy of the questions it was answered against, so editing a list never alters a past check.
create schema if not exists checks;

create table checks.templates (
  id uuid primary key,
  company_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  applies_to text not null check (applies_to in ('all', 'selected')),
  -- The vehicles it applies to when `applies_to` is 'selected'; empty otherwise.
  vehicle_ids jsonb not null default '[]'::jsonb,
  items jsonb not null,
  -- Goes up by one each time the list is changed.
  version integer not null check (version >= 1),
  -- A list is archived, not deleted, because past checks refer to it.
  archived_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index templates_company_idx on checks.templates (company_id);

grant usage on schema checks to wagonwise_app;
grant select, insert, update, delete on all tables in schema checks to wagonwise_app;
alter default privileges in schema checks grant select, insert, update, delete on tables to wagonwise_app;

alter table checks.templates enable row level security;
create policy company_rows on checks.templates
  using (company_id = public.rls_company_id() or public.rls_platform_staff())
  with check (company_id = public.rls_company_id() or public.rls_platform_staff());
