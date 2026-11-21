-- Visits to the website (sites/landing), counted without cookies (docs/modules.md, "Website visits"): which page, or that the For
-- hauliers video was played, and where the visitor came from as a short source and campaign name. No IP address, no browser
-- details, no id that follows a person: a row says only "someone opened this page from Facebook". Kept 90 days, deleted by the same
-- hourly sweep as the flow events.
create table usage.site_visits (
  id uuid primary key,
  kind text not null check (kind in ('view', 'video_play')),
  page text not null check (char_length(page) between 1 and 40),
  source text check (source is null or source ~ '^[a-z0-9._-]{1,60}$'),
  campaign text check (campaign is null or campaign ~ '^[a-z0-9._-]{1,60}$'),
  at timestamptz not null
);
create index site_visits_at_idx on usage.site_visits (at);
