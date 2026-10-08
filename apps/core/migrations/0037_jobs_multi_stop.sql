-- A job is an ordered list of stops, collections and deliveries in the order the driver does them (it already
-- was in jobs.job_stops; now the driver works down it). current_stop is the stop the driver is heading for or
-- is at. Completing a stop moves it on; the job is delivered once the last stop is done.
alter table jobs.jobs add column current_stop integer not null default 0;

-- Jobs already in flight: the old flow had pickups first, then deliveries, one step each. Loaded, en route and
-- at delivery mean the pickups are done; delivered means every stop is.
update jobs.jobs j set current_stop = case
  when j.status in ('loaded', 'en_route', 'at_delivery') then
    (select count(*) from jobs.job_stops s where s.job_id = j.id and s.kind = 'pickup')
  when j.status = 'delivered' then
    (select count(*) from jobs.job_stops s where s.job_id = j.id)
  else 0
end;

-- Proof of delivery is per delivery stop. Existing photos belong to the job's last delivery.
alter table jobs.proof_of_delivery add column stop_sequence integer;
update jobs.proof_of_delivery p set stop_sequence = coalesce(
  (select max(s.sequence) from jobs.job_stops s where s.job_id = p.job_id and s.kind = 'delivery'), 0);
alter table jobs.proof_of_delivery alter column stop_sequence set not null;
alter table jobs.proof_of_delivery drop constraint proof_of_delivery_pkey;
alter table jobs.proof_of_delivery add primary key (job_id, stop_sequence);
