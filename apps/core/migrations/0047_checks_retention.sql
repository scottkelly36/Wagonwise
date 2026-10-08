-- Walk-round checks: how long a firm keeps its records of them. The firm is the controller of these records, so it
-- chooses; WagonWise deletes on its instruction, daily. Default 12 months (1 to 120). A check that still has a defect
-- open or only seen is kept past this until the office marks the defect fixed, so an unresolved fault is never lost.
alter table checks.settings
  add column retention_months integer not null default 12 check (retention_months between 1 and 120);
