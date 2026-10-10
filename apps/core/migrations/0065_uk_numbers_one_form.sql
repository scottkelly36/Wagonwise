-- A UK number is now always stored +44…, however it was typed, so 07700 900123 and +44 7700 900123 are one person (see
-- identity/domain/identifier.ts). Before, it was stored as typed, so a driver who made an account as +44… and typed 07… later was
-- told they needed an invite code, and a firm that invited 07… did not match a driver who signed in with +44…. This tidies what
-- is already stored. A row is left alone if changing it would clash with another row (the same person stored twice), so nothing
-- is lost or merged; sign-in still finds such an account under either form.
create function pg_temp.uk_canonical(raw text) returns text language sql immutable as $$
  select case
    when raw ~ '^0[1-9][0-9]{8,9}$' then '+44' || substr(raw, 2)
    when raw ~ '^0044[1-9][0-9]{8,9}$' then '+44' || substr(raw, 5)
    when raw ~ '^\+?440?[1-9][0-9]{8,9}$' then '+44' || regexp_replace(raw, '^\+?440?', '')
    else raw
  end
$$;

update identity.drivers d
set identifier = pg_temp.uk_canonical(d.identifier)
where pg_temp.uk_canonical(d.identifier) <> d.identifier
  and not exists (
    select 1 from identity.drivers o where o.identifier = pg_temp.uk_canonical(d.identifier)
  )
  and (
    select count(*) from identity.drivers x
    where pg_temp.uk_canonical(x.identifier) = pg_temp.uk_canonical(d.identifier)
  ) = 1;

update fleet.driver_links l
set invited_identifier = pg_temp.uk_canonical(l.invited_identifier)
where l.invited_identifier is not null
  and pg_temp.uk_canonical(l.invited_identifier) <> l.invited_identifier
  and not exists (
    select 1 from fleet.driver_links o
    where o.company_id = l.company_id
      and o.invited_identifier = pg_temp.uk_canonical(l.invited_identifier)
      and o.status = l.status
  )
  and (
    select count(*) from fleet.driver_links x
    where x.company_id = l.company_id
      and x.status = l.status
      and x.invited_identifier is not null
      and pg_temp.uk_canonical(x.invited_identifier) = pg_temp.uk_canonical(l.invited_identifier)
  ) = 1;
