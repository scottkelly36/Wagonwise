-- Which over-the-air update the phone was running, as the day it was published (docs/flow-tracking-plan.md, "By app version").
-- The store version stays the same across over-the-air releases (1.2.1 since 13 November), so without this the usage page could
-- not tell a redesign apart from the release before it. The same day for everyone on that update, so it says nothing about a
-- person. Null for an app built before this was sent, and for the store build's own code with no update applied.
alter table usage.flow_events add column update_date date;
