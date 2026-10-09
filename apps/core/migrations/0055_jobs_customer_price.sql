-- What a job earns: an optional customer (free text, as the firm writes it) and an optional agreed price in whole pence.
-- Both are the firm's own business and are shown to staff who can dispatch or read reports, never to drivers. The columns
-- sit on jobs.jobs, so the existing company and driver row policies already cover them.
alter table jobs.jobs
  add column customer text check (customer is null or char_length(customer) between 1 and 120),
  add column price_pence bigint check (price_pence is null or price_pence between 0 and 100000000);
