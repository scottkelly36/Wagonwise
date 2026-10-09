-- A vehicle's registration number (Phase 3 M4 foundation). Optional, because vehicles already in the system have none,
-- and stored tidy: capitals, no spaces or dashes, so "ab12 cde" and "AB12CDE" are the same vehicle. Unique within a
-- company, so one lorry is not entered twice; two companies may each have a vehicle with the same plate (a sale).
alter table fleet.vehicles
  add column registration text check (registration is null or registration ~ '^[A-Z0-9]{2,8}$');

create unique index vehicles_company_registration_idx
  on fleet.vehicles (company_id, registration) where registration is not null;
