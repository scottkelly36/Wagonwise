# Environment notes (Windows dev machine)

> Archived from `docs/progress.md` on 2026-09-28, moved verbatim. "Above"/"below" in this
> text may refer to sections now in a sibling file — see the index in `docs/progress.md`.

## Environment notes

- **`gh` (GitHub CLI) is installed but not on a normal terminal's PATH** — full path
  `C:\Program Files\GitHub CLI\gh.exe`. Its saved credential (a fine-grained PAT) can see this
  account's older public repos but returns 404 for `scottkelly36/Wagonwise` — the token's repo
  access doesn't include this private repo. PRs for this repo are opened by the user directly
  (matches decision 43's browser-auth gap: this repo's PRs have always been created/merged by
  `scottkelly36` per `git log --merges`, not by a prior session's tooling). Revisit if `gh pr
create` is ever actually needed from a session — regenerate the PAT with this repo included, or
  `gh auth login` fresh.
- Node 24.21 (`C:\Program Files\nodejs`), git 2.55.0, Docker Desktop 29.8.0 with WSL2, pnpm
  12.5.1 via corepack (`corepack enable pnpm`). The pnpm store lives on E: (`E:\.pnpm-store`),
  pnpm's default of one store per drive.
- pnpm 12 blocks install scripts by default; allowed ones are listed under `allowBuilds` in
  `pnpm-workspace.yaml` (`esbuild`, and from M1.4 `cpu-features`, `protobufjs`, `ssh2` —
  Testcontainers' transitive deps). The `pnpm` field in package.json is no longer read.
- **`corepack enable pnpm` needs an admin terminal** — it writes into `C:\Program Files\nodejs`,
  which a normal user account can't do. Run it once from an elevated PowerShell; until then
  `pnpm` isn't on a normal terminal's PATH (a session working around this with a temporary shim
  doesn't fix it for your own terminal).
- Git needs `git config --global --add safe.directory E:/projects/wagonwise` on any freshly
  reinstalled Windows account before it will read this repo ("dubious ownership" — the repo's
  files are owned by the pre-reinstall account SID). Global `user.name`/`user.email` also need
  setting again after a clean install; both are set as of 2026-09-22.

## Resolved: fresh Windows 11 install (2026-09-21 → 2026-09-22)

Work paused 2026-09-21 for a clean Windows 11 install (only `C:` wiped; `E:\projects\wagonwise`
is on a separate physical disk and was never touched). The repo survived untouched, and a
`git bundle` backup was taken before the wipe as a second copy (`D:\backups\wagonwise.bundle` —
still there, harmless to keep). Rebuilt in order: Node 24, Docker Desktop (needed `wsl --install
--no-distribution` from an admin PowerShell plus a reboot — Docker's own installer didn't enable
WSL2 on its own this time), git (needed the `safe.directory` and identity fixes now in
Environment notes, above), then `pnpm install`. All verified green before M1.4 started; see
Environment notes for what a future clean install will need to redo.
