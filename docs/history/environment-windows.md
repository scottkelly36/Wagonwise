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

## Native Android builds on this machine (found 2026-11-08)

- **Symptom:** `expo run:android` (debug or release) fails in the C++ tasks of native libraries (`react-native-screens`, `react-native-worklets`,
  `expo-updates`, `expo-modules-core`, `react-native-reanimated`) with `ninja: error: manifest 'build.ninja' still dirty after 100 tries`. Which
  libraries fail changes with the path length, which is the clue.
- **Cause:** Windows' 260-character path limit. `LongPathsEnabled` is already 1 here, but the CMake and ninja in the Android SDK (3.22) do not use
  it. Paths through pnpm's `node_modules/.pnpm/<long name>/node_modules/<pkg>/android/.cxx/...` are too long, and CMake copies the whole source path into
  each object's path, so one library reached 361 characters. `ninja -d explain` in the library's `.cxx` build folder shows the file that is missing (a
  prefab file whose 269-character path was silently never created), which is what makes ninja loop.
- **Does not work:** a `subst` drive letter (the native step passes, then Metro's bundling and Kotlin's incremental caches fail because they see both
  the drive letter and the real path); and only shortening the folder (`C:\w` with the normal pnpm layout still fails on one library).
- **Works:** a separate working copy at a short real path with a flat `node_modules`:
  1. `git worktree add C:\w <branch>`.
  2. In `C:\w\pnpm-workspace.yaml` add `nodeLinker: hoisted`. **pnpm 12 reads it from there, not from `.npmrc`.** Delete the old `node_modules` first (stop any
     Gradle and Kotlin daemon `java.exe` first, or files stay locked), then `pnpm install --frozen-lockfile`.
  3. Build the contracts with `node ../../node_modules/typescript/bin/tsc -p tsconfig.build.json` in `packages/contracts` (in this mode a `pnpm` script
     triggers a fresh install, which loops back into the same step).
  4. In `apps/driver-app`: `npx expo prebuild --platform android --no-install`, put `reactNativeArchitectures=x86_64` in `android/gradle.properties`
     (emulator only; about 3 minutes instead of building four chips), then `npx expo run:android --variant debug --no-bundler --device <AVD name>`
     (the **name**, not `emulator-5554`). A release build was not tried in this layout.
  5. Metro from the same folder: `CI=1 npx expo start --dev-client`; the emulator reaches it at `10.0.2.2:8081`.
- `expo prebuild` rebuilds the (gitignored) `android/` folder from scratch, so any hand edit in it is lost. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` means the app
  already on that emulator was signed with a different key: install on another virtual device, or uninstall (which erases that app's data).
- **Emulators:** run headless with `emulator -avd <name> -no-window -no-audio`; `adb emu geo fix <lon> <lat>` moves the GPS; the first location request
  shows Google's "Location Accuracy" dialog, which a headless run hides (screenshot with `adb exec-out screencap -p`, then tap **Turn on**).
- **Installed 2026-11-08:** the SDK command-line tools (`cmdline-tools/latest`, checked against Google's published SHA-256), the Android Auto Desktop
  Head Unit 2.0 (`extras/google/auto/`), and a virtual device `Pixel_6_Play` on the Play Store image (its `config.ini` was written by hand, because
  `avdmanager` left placeholders in the one it made).
