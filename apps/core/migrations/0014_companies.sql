create schema if not exists companies;

create table companies.companies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null
);
