-- Walk-round checks, office side: who last changed a defect's status (open, acknowledged, fixed). The row already
-- carries when (`status_changed_at`, added with the table in 0044). The staff policies from 0044 already let a
-- company's staff and WagonWise admins read and change a company's defects, so nothing else is needed here.
alter table checks.defects add column status_changed_by uuid;
