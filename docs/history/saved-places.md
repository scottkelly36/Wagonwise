# Saved places: a farm's real gate, marked once

Added 2026-10-08, from the owner's first drives and a tester's feedback.

## The problem

A farm's postcode often lands on the postcode centre, not the gate, sometimes miles away. The driver finds the
real entrance, but the next job to that farm sends the next driver to the wrong place again.

## What it does

- A driver stands at the real gate, taps **Mark this spot** (job screen, or _Mark a place here_ on the Saved tab),
  picks Farm, Yard or Other, confirms the name (it starts as the stop's name) and adds a note for the next driver.
  The spot is exactly where they are. It can be undone straight after.
- **Company drivers' places belong to the company**: every driver (and the dispatcher) sees them. Which company: the
  company of the job they are on, else their only active company. **A driver with no company** (an owner-driver on
  their own) marks **personal** places, which only they see. With several companies and no job it is personal rather
  than guessed.
- Any driver of the company can improve a note or name (a better note helps the next driver); only the driver who
  marked a place, or dispatch, can remove it. Dispatchers can edit and remove in the dashboard.
- **Dashboard:** a _Places_ page (everyone at the company sees it; `dispatch` edits). When creating a job, entrances
  marked within 5 km of a typed postcode are offered; choosing one sends the driver to that spot and carries its note
  onto the stop. (The postcode lookup alone cannot know.)
- **Driver app:** a _Gates and entrances_ card on the job screen (places within 5 km of the stop, notes, and the mark
  button), a _Places_ section on the Saved tab, green round markers on the home and trip maps (smaller while driving),
  and a sheet to read or improve the note, remove it, or _Take me there_.

## When a driver joins, moves or leaves a company

- **A solo driver joins a company:** their personal places stay personal and private: nothing is shared without them
  choosing. A personal place now has a **Share with my company** button, so they can hand over the farms they already
  know. (Sharing is one way: what was marked for a company stays the company's.)
- **Moves from company A to company B:** the places they marked for A stay A's, like A's jobs and proof photos, and they
  stop seeing them once the link ends (the database checks for an _active_ link). Their personal places go with them.
  New places they mark go to B (the company of the job they are on, else their only active company).
- **Leaves a company:** as above: they lose sight of the company's places; their personal ones remain.
- **Deletes their account:** their personal places are deleted; the places they marked for a company stay with the
  company with nothing left to say who marked them (`created_by` is cleared). Done by the same eraser as the rest of
  the account (`places.eraseDriverData`).

## How it is built

- `places` module (migration 0036, schema `places`). `SavedPlace`: company (absent for a personal one), category,
  name, note, location (geography), who marked it, times. The spot never moves: to correct it, delete and mark again.
- **Row-Level Security:** company staff and WagonWise admins by company scope; a driver sees the places of a company they
  have an _active_ `fleet.driver_links` link with, and their own personal ones (`company_id is null` and they created
  it). A check constraint means a place is always one or the other.
- Two doors onto the same use cases: `/places/*` (driver token, driver scope) and `/staff/places/*` (staff token). Both
  BFFs forward. `POST /places` takes an id chosen by the app, so a retry is not a second place.
- Permissions: view = the company's drivers and staff; mark and edit = the company's drivers and dispatchers; delete =
  the marker or dispatch. Personal places: the owner only, and no staff account is offered them.

## Public places (added 2026-10-24, asked for by drivers)

- A driver can make one of their **own personal places** public: a **Share with all drivers** button on the place sheet, with a
  confirm step that says what it means (every WagonWise driver sees it and the note; the marker's name is never shown; no phone
  numbers, names or home addresses in the note; not someone's private land). **Make private again** reverses it. Public places show
  on the home map with the others, around the driver or the map view.
- **Only a personal place can be public** (a database check, `saved_places_public_is_personal`): a company's places, such as a
  customer's site, are never published by one driver's tap, and **sharing a public place with a company makes it private**.
- **Nothing says who marked it:** `created_by` stays in the table but is in no answer. Another driver's public place is read-only in
  the app: they can read the note, go there, and **report** it.
- **Reporting** (wrong spot, someone's home or private land, offensive, other): one report a driver a place; **three different
  drivers hide it from everyone else** (the owner still sees it), until a person at WagonWise decides. No admin screen for
  that yet: the reports are in `places.place_reports`.
- Built as `is_public` on `places.saved_places` plus `places.place_reports` (migration 0076); a second, read-only RLS policy lets
  any driver read a public row (writes still need the owner's policy). Core: `POST /places/public/nearby` (at most 300, radius up
  to 50 km), `PUT /places/:id/visibility`, `POST /places/:id/report`; the driver BFF forwards all three. Account deletion removes a
  driver's places (public ones too) and the reports they made.

### Reviewing reported places (added 2026-10-25)

- Dashboard, WagonWise staff only: **Content > Reported places**. Lists public places that have at least one report, most reported first, with
  the note, a map link, how many different drivers reported it, why, and whether it is hidden from other drivers yet. Never who marked it
  or who reported it.
- **Keep it public** clears the reports (a hidden place shows again). **Make private** takes it off the public map and gives it back to its
  owner, who keeps it and does not lose anything; the reports are cleared. Nothing is deleted by a moderator.
- Core: `GET /staff/places/reported` and `POST /staff/places/:id/moderate` (`{ decision: 'keep' | 'make_private' }`), WagonWise staff
  only (a company's staff get 403); the staff BFF forwards both.

## Not done

- Public places on the trip screen's map (the home map only so far), and copying someone's public place to your own.

- Marking from the trip screen with one tap and a voice note (the job screen and Saved tab do it for now).
- Automatically using a marked place as a job's destination without the dispatcher choosing it, and matching places to
  stop names (only to the postcode's position).
- what3words lookup for stops (also asked for in testing): a separate piece, needs a what3words API key.
- A photo of the entrance.
