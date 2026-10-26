# CLAUDE.md

This repo keeps its agent instructions in **[`AGENTS.md`](AGENTS.md)** — the cross-tool
standard — so every assistant reads the same file and the rules can't drift between copies.

**Read [`AGENTS.md`](AGENTS.md) before doing anything in this repo.** It holds the product
context, the stack, the non-negotiable architecture rules, the domain safety rules, and how
work should be handed over.

Then, depending on the task:

- [`docs/progress.md`](docs/progress.md) — short: status, what's next, open items, and an index
  into `docs/history/` (per-milestone decisions and deviations). Read the history file for a
  milestone only when working in that area. The dated change log is `docs/history/log.md`
  (newest first: read its top ~40 lines, or `grep`).
- [`README.md`](README.md) — prerequisites, first-time set-up, commands. Source of truth
  for getting the project running.
- [`docs/modules.md`](docs/modules.md) — per-module notes (sign-in, routing, hazards, SOS,
  the BFFs, the driver app). It is long: `grep -n '^## ' docs/modules.md`, then read only that section.
- [`docs/phase-1-tech-design.md`](docs/phase-1-tech-design.md) — the original design, background
  only. Open the section you need, not the whole file.
