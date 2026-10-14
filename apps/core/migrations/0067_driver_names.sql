-- Driver names. A driver can give their own name in the app (identity.drivers.name), and a company can
-- give its own label to a driver it works with (fleet.driver_links.label). The portal shows the label,
-- else the driver's name, else the sign-in identifier. Both are optional, so nothing existing changes.
--
-- To undo: alter table identity.drivers drop column name; alter table fleet.driver_links drop column label;

alter table identity.drivers add column name text;
alter table fleet.driver_links add column label text;
