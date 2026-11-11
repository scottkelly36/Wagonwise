-- Whether a vehicle meets the Euro VI emissions standard, which every low emission and clean air zone for a lorry
-- asks about. Three answers, so nullable: true, false, or null for "not stated" (the driver or firm does not know).
-- Nothing assumes a vehicle is compliant, so null is treated as "may be charged", never as "fine".
alter table routing.vehicle_profiles add column euro_vi boolean;
alter table fleet.vehicles add column euro_vi boolean;
