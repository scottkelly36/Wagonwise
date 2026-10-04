// What the driver app release workflow should do.
//
// The model: merging to main publishes nothing by itself. A pull request carrying the `release` label
// publishes the driver app to production, either when it merges or when the label is added to an
// already-merged pull request. "Release" always means "publish main as it is now" (never an older
// commit, which could undo a newer over-the-air update), and what changed is measured against the
// last commit that was released (the `driver-app/production` tag).
//
// Pure functions, no I/O, so the rules are tested (release-decision.test.mjs) rather than hidden in
// YAML. The workflow's thin wrapper (decide-release.mjs) feeds them the real git facts.

/** The label that releases to production. Must match the label created in GitHub and the setup
 *  checklist. */
export const RELEASE_LABEL = 'release';

/** Moves to each commit that has been released to production, so the next release knows what is new. */
export const RELEASED_TAG = 'driver-app/production';

/** Paths whose changes can alter what a phone runs. Everything else (server, dashboard, docs) never
 *  triggers an app release. */
const APP_PATHS = ['apps/driver-app/', 'packages/contracts/'];

/** Files in those paths that do not change the shipped app. */
function isShipped(file) {
  if (!APP_PATHS.some((prefix) => file.startsWith(prefix))) return false;
  if (/\.test\.[jt]sx?$/.test(file)) return false;
  if (file.endsWith('.md')) return false;
  return true;
}

/** Files that, when changed without a version bump, usually mean native code changed. */
const NATIVE_LOOKING = [
  'apps/driver-app/package.json',
  'apps/driver-app/app.config.ts',
  'apps/driver-app/eas.json',
];

/** `version: '1.2.0'` out of app.config.ts's text. `undefined` when it cannot be found. */
export function parseVersion(appConfigSource) {
  const match = /^\s*version:\s*['"]([^'"]+)['"]/m.exec(appConfigSource ?? '');
  return match?.[1];
}

/**
 * @param {object} input
 * @param {'release'|'update'|'build'|'check'} input.mode
 *   `release` is the normal path (a labelled pull request); the others are run by hand.
 * @param {boolean} input.labelled        whether the release label is on the pull request
 * @param {string[]} input.changedFiles   paths changed since the last released commit
 * @param {string|undefined} input.versionReleased  app version at the last released commit
 * @param {string|undefined} input.versionNow       app version at the commit being released
 * @returns {{ kind: 'none'|'update'|'build'|'check', reason: string, warnings: string[] }}
 */
export function decideRelease({ mode, labelled, changedFiles, versionReleased, versionNow }) {
  if (mode === 'check')
    return { kind: 'check', reason: 'manual check of the release setup', warnings: [] };
  if (mode === 'update')
    return { kind: 'update', reason: 'manually requested update', warnings: [] };
  if (mode === 'build') return { kind: 'build', reason: 'manually requested build', warnings: [] };

  if (!labelled) {
    return {
      kind: 'none',
      reason:
        `nothing was published: no \`${RELEASE_LABEL}\` label. Merging alone never releases. ` +
        `Add the label to this pull request (before or after merging) to publish main to production`,
      warnings: [],
    };
  }

  if (changedFiles.filter(isShipped).length === 0) {
    return {
      kind: 'none',
      reason: 'nothing in the driver app or its contracts has changed since the last release',
      warnings: [],
    };
  }

  if (versionReleased !== versionNow) {
    return {
      kind: 'build',
      reason: `app version ${versionReleased} to ${versionNow}, so this needs a new store build`,
      warnings: [],
    };
  }

  const warnings = [];
  const nativeLooking = changedFiles.filter((f) => NATIVE_LOOKING.includes(f));
  if (nativeLooking.length > 0) {
    warnings.push(
      `${nativeLooking.join(', ')} changed without a version bump. If this adds or changes native code ` +
        `(a package, a plugin, permissions), phones on the current build will not have it: raise "version" ` +
        `in apps/driver-app/app.config.ts and release again.`,
    );
  }
  return {
    kind: 'update',
    reason: 'JavaScript-only change to the driver app (version unchanged)',
    warnings,
  };
}

/**
 * Whether CI passed on a commit, from the CI workflow runs for it (newest first, as GitHub returns
 * them): the newest finished run must have succeeded, and nothing may still be running.
 * @param {{ status: string, conclusion: string|null }[]} runs
 */
export function ciPassed(runs) {
  if (runs.length === 0) return { ok: false, why: 'CI has not run on this commit yet' };
  if (runs.some((run) => run.status !== 'completed')) {
    return { ok: false, why: 'CI is still running on this commit' };
  }
  if (runs[0].conclusion !== 'success') {
    return { ok: false, why: `CI did not pass on this commit (${runs[0].conclusion})` };
  }
  return { ok: true };
}
