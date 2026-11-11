-- A receiver's signature on delivery, set like the proof-of-delivery photo: a dispatcher can require one per job
-- (requires_signature), the driver takes it at the delivery, and the job cannot be marked delivered without it when
-- required. It is kept as the lines the receiver drew (a small json array of strokes), not a picture, since the driver
-- app has no way to turn a drawing into an image file. It follows the photo's retention: the company's
-- photo_retention_months, enforced by the same daily task.
alter table jobs.jobs add column requires_signature boolean not null default false;

create table jobs.delivery_signatures (
  job_id uuid not null references jobs.jobs (id) on delete cascade,
  stop_sequence integer not null check (stop_sequence >= 0),
  -- [[[x, y], ...], ...] in a 1000 x 500 box; checked by the contract before it gets here.
  strokes jsonb not null,
  signer_name text check (signer_name is null or char_length(signer_name) <= 80),
  captured_at timestamptz not null,
  primary key (job_id, stop_sequence)
);

alter table jobs.delivery_signatures enable row level security;
create policy via_job on jobs.delivery_signatures
  using (exists (select 1 from jobs.jobs j where j.id = job_id))
  with check (exists (select 1 from jobs.jobs j where j.id = job_id));
