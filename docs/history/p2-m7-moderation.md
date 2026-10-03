# P2-M7: hazard moderation and trust scoring

Scoped 2026-10-03 from the Phase 2 tech design doc §7. Sliced like the other Phase 2 milestones.

| Slice | Scope                                                             | Status            |
| ----- | ----------------------------------------------------------------- | ----------------- |
| M7.1  | Moderation queue, decisions with an audit trail, dashboard page   | Done — 2026-10-03 |
| M7.2  | Reporter trust score, "trusted reporter" signal, the routing rule | Done — 2026-10-03 |

## Decisions (owner, 2026-10-03)

- **Routing policy: hybrid by severity.** Hold a blocking report back from routing only when it is
  clearly doubtful (the owner chose this over keeping routing fully cautious, or holding every
  low-trust report). The design doc's version of "doubtful" is a low-trust reporter with no
  measurement on a major road. **Problem to resolve in M7.2:** nothing in core knows what road class
  a hazard is on (a report is only a point), so "on a major road" cannot be evaluated today. Options
  then: drop that condition (low trust and no measurement and unconfirmed), or add road class from
  the routing data. This must be decided before M7.2 changes routing, because it makes routing
  _less_ cautious than today for the reports it holds back.
- **Build the queue first.** It is useful immediately and is needed whichever policy applies.
- **WagonWise staff moderate, to begin with** (design doc: "in the early months, you are the
  moderator"). Company staff or trusted drivers can come later.

- **M7.2 decisions (owner, 2026-10-03):** the "major road" condition is **dropped** (no road class
  in core; adding it means a Valhalla lookup per report), and a reporter with no history is
  **neutral**, never low.

## M7.2: trust score and the routing hold

**This is the one place routing becomes less cautious.** Everything else in M7 only adds caution.

- **Trust** (`domain/trust.ts`) is derived, never stored: score = approved − 2 × moderator-rejected −
  community-dismissed, counted from the reporter's reports and `moderation_decisions`. `low` at
  −3 or below (two rejections; a rejection and a dismissal; three dismissals), `high` at +3 or
  above, otherwise `neutral`. No history is `neutral`. Thresholds are guesses; revisit with pilot data.
- **The hold** (`isHeldBackFromRouting`): a blocking report is left out of routing only when the
  reporter is `low` AND it has no measurement AND no confirmations AND no moderator approval. It is
  applied in `hazards`' `findAvoidanceCandidates` (`api.ts`), so routing is untouched and still only
  sees its own `ReportedObstruction`. `findHazardIdsNear` (the on-route display list) is not
  filtered: a held-back report still shows on the map and the route's hazard list.
- **Cost:** `assessReports` (`application/trust.ts`) looks up a reporter only for reports that
  could be held (unmeasured, unconfirmed), so a normal route query adds no queries when every
  blocking report is measured or confirmed.
- **Queue:** each item now carries `trust` and `heldBackFromRouting`; the dashboard shows the
  reporter's standing and a red note on held-back reports. Approving one puts it back into routing.
- **Not touched:** official restrictions and `routing.restriction_overrides` never pass through
  this rule.
- **Known gaps:** a reporter's history misses reports an admin hard-deleted. A reporter who is
  rejected twice can only recover by getting reports approved or confirmed.
- **Verified:** domain tests (12), use-case tests against the in-memory fake (7), the SQL against a
  real Postgres (3), and `hazards/api.test.ts` drives `findAvoidanceCandidates` through the real
  facade on PostGIS (5: held back, new reporter still routed, measured routed, approved routed,
  still on the hazard list). Not run against real routing/Valhalla, and the dashboard change has not
  been looked at in a browser.

## M7.1: the moderation queue

**Changes nothing about routing.** A report waiting in the queue still affects routes exactly as it
does today. Only a rejection takes a report out of use, and that is a person's decision on the record.

- **Queue** (`GET /staff/hazard-reports/moderation-queue`): active reports no moderator has approved
  that are blocking-type (low bridge, weight limit, width restriction, no HGVs) or disputed (at least
  one confirmation and one dismissal; `DISPUTED_MIN_EACH` in `domain/moderation.ts`). Oldest first.
  Rejected and expired reports are not active, so they drop out; an approved one stays out.
- **Actions** (`POST /staff/hazard-reports/:id/moderate`): `approve` (no change to the report; the
  decision is the approval), `reject` (marks it `dismissed`, the status everything already ignores),
  `edit` (type and/or measurement, or `null` to remove the measurement; a new type gets that type's
  default expiry), `set_lifetime` (permanent, or temporary for the default 7 days from now).
- **Audit** (`hazards.moderation_decisions`, migration 0033; `GET .../:id/decisions`): who, what,
  when, an optional note, and before and after snapshots of type, measurement, status and expiry.
  No foreign key to the report, so the record survives the report being deleted. The report change,
  the audit row and a `HazardModerated` outbox event are written in one transaction.
- **Admins only** (WagonWise staff), checked before the report is looked up, so a non-admin learns
  nothing about whether an id exists.
- **Dashboard:** a **Moderation** page (WagonWise staff only) with each queued report's type,
  measurement, counts, note, why it is there, a link to see it on OpenStreetMap, and the actions.
- **Safety:** moderation touches community reports only. Official restrictions are not hazard
  reports and cannot be edited or rejected here. An edit that lowers a bridge's height makes routing
  more cautious for taller vehicles; one that raises it, or a reject, makes it less cautious for that
  spot, which is the human judgement moderation exists for.
- **Not done:** merging duplicates (the automatic merge policy already folds near-identical reports
  together; a manual merge needs its own rules about which counts survive), an "abusive" flag (there
  is no way for drivers to flag a report yet), a decision history in the UI (the endpoint exists),
  and moderators other than WagonWise admins.
- **Known behaviour:** approving a disputed report removes it from the queue for good, even if more
  disputes pile up later.
- **Verified:** domain rules (15 tests), use-case routes over HTTP (admin gate, approve, reject,
  edit, invalid measurement, unknown id), the Postgres queue query and atomic write against a real
  database, contract and staff-bff forward tests, dashboard typecheck and lint. The dashboard page
  has not been looked at in a browser against a live backend.
