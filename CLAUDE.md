# CLAUDE.md

This repo keeps its agent instructions in **[`AGENTS.md`](AGENTS.md)** — the cross-tool
standard — so every assistant reads the same file and the rules can't drift between copies.

**Read [`AGENTS.md`](AGENTS.md) before doing anything in this repo.** It holds the product
context, the stack, the non-negotiable architecture rules, the domain safety rules, and how
work should be handed over.

Then, depending on the task:

- [`README.md`](README.md) — prerequisites, first-time set-up, commands. Source of truth
  for getting the project running.
- [`docs/phase-1-tech-design.md`](docs/phase-1-tech-design.md) — the full design. Read
  before starting any milestone.
- [`docs/progress.md`](docs/progress.md) — milestone status and the decisions log, so a
  session can pick up cold.
