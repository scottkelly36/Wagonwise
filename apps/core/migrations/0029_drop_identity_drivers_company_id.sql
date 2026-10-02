-- P2-M2.8: fleet.driver_links (0028) replaces this single column — a driver can belong to
-- several companies, with real history (invited/requested/active/declined/left), not one value
-- an admin overwrote. Migration 0028 already backfilled an active link for every driver who had
-- one. Nothing reads this column any more (identity's `update-driver.ts`/`list-drivers.ts` and
-- the dashboard's driver-accounts screen are gone with it).
alter table identity.drivers drop column company_id;
