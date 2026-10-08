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

## Not done

- Marking from the trip screen with one tap and a voice note (the job screen and Saved tab do it for now).
- Automatically using a marked place as a job's destination without the dispatcher choosing it, and matching places to
  stop names (only to the postcode's position).
- what3words lookup for stops (also asked for in testing): a separate piece, needs a what3words API key.
- A photo of the entrance.
