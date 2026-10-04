// What the driver app release workflow should do for a change that landed on main.
//
// Pure functions, no I/O, so the rules are tested (release-decision.test.mjs) rather than hidden in
// YAML. The workflow's thin wrapper (decide-release.mjs) feeds them the real git facts.

/** Label that says "this merge should publish a new Play build". Must match the label created in
 *  GitHub and the setup checklist. */
export const NATIVE_RELEASE_LABEL = 'release-android';

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
 * @param {'auto'|'update'|'build'|'check'} input.mode   `auto` on a merge; the others are manual.
 * @param {string[]} input.changedFiles                    paths changed by the merge
 * @param {string|undefined} input.versionBefore
 * @param {string|undefined} input.versionAfter
 * @param {string[]} input.labels                          labels on the merged pull request
 * @returns {{ kind: 'none'|'update'|'build'|'check', reason: string, warnings: string[] }}
 */
export function decideRelease({ mode, changedFiles, versionBefore, versionAfter, labels }) {
  if (mode === 'check')
    return { kind: 'check', reason: 'manual check of the release setup', warnings: [] };
  if (mode === 'update')
    return { kind: 'update', reason: 'manually requested update', warnings: [] };
  if (mode === 'build') return { kind: 'build', reason: 'manually requested build', warnings: [] };

  const shipped = changedFiles.filter(isShipped);
  if (shipped.length === 0) {
    return { kind: 'none', reason: 'no change to the driver app or its contracts', warnings: [] };
  }

  const bumped = versionBefore !== versionAfter;
  const labelled = labels.includes(NATIVE_RELEASE_LABEL);

  if (bumped) {
    if (labelled) {
      return {
        kind: 'build',
        reason: `version ${versionBefore} to ${versionAfter} with the ${NATIVE_RELEASE_LABEL} label`,
        warnings: [],
      };
    }
    return {
      kind: 'none',
      reason:
        `version ${versionBefore} to ${versionAfter} but no ${NATIVE_RELEASE_LABEL} label, so no build ` +
        `was started. Run the workflow with mode "build" if you want one.`,
      warnings: [],
    };
  }

  const warnings = [];
  if (labelled) {
    warnings.push(
      `The ${NATIVE_RELEASE_LABEL} label was ignored: the version did not change, so this is a JavaScript update. ` +
        `A native release needs a higher "version" in apps/driver-app/app.config.ts.`,
    );
  }
  const nativeLooking = changedFiles.filter((f) => NATIVE_LOOKING.includes(f));
  if (nativeLooking.length > 0) {
    warnings.push(
      `${nativeLooking.join(', ')} changed without a version bump. If this adds or changes native code ` +
        `(a package, a plugin, permissions) phones on the current build will not have it: raise "version" and ` +
        `use the ${NATIVE_RELEASE_LABEL} label.`,
    );
  }
  return {
    kind: 'update',
    reason: 'JavaScript-only change to the driver app (version unchanged)',
    warnings,
  };
}
