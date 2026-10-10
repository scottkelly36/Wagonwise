/**
 * Telling a driver a new build is out. A "build" is a store release with a new version number; it matters because the app's
 * over-the-air updates are tied to the version: a driver on 1.2.1 never receives an update made for 1.3.0, so the only way they
 * get it is the store. The server says the newest version and the oldest still allowed (GET /app/version); this works out which
 * message, if any, applies.
 */

/** "1.2.1" as [1, 2, 1]; undefined when it is not numbers separated by dots. */
export function parseVersion(version: string | undefined | null): number[] | undefined {
  if (version === undefined || version === null) return undefined;
  const parts = version.trim().split('.');
  if (parts.length === 0 || parts.some((p) => !/^\d{1,6}$/.test(p))) return undefined;
  return parts.map(Number);
}

/** Negative when a is older than b, 0 when the same, positive when newer. A missing part counts as 0 (1.3 is 1.3.0). */
export function compareVersions(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type BuildStatus = 'current' | 'available' | 'required';

export interface BuildInfo {
  readonly latestVersion?: string | undefined;
  readonly minimumVersion?: string | undefined;
}

/**
 * Where this build stands: `required` below the oldest allowed, `available` below the newest, otherwise `current`. A version that
 * cannot be read, on either side, says nothing: it must never nag or lock a driver out because of a typo in a setting.
 */
export function buildStatus(current: string | undefined | null, info: BuildInfo): BuildStatus {
  const mine = parseVersion(current);
  if (mine === undefined) return 'current';
  const minimum = parseVersion(info.minimumVersion);
  if (minimum !== undefined && compareVersions(mine, minimum) < 0) return 'required';
  const latest = parseVersion(info.latestVersion);
  if (latest !== undefined && compareVersions(mine, latest) < 0) return 'available';
  return 'current';
}

export type UpdateNotice =
  | { readonly kind: 'none' }
  /** A newer over-the-air update has been downloaded and needs the app restarted. */
  | { readonly kind: 'restart' }
  /** A newer build is in the store. */
  | {
      readonly kind: 'build';
      readonly version: string | undefined;
      readonly url: string | undefined;
    }
  /** This build is too old to go on with. */
  | { readonly kind: 'required'; readonly url: string | undefined };

/**
 * The one thing to tell the driver. A required update comes first, then a downloaded update waiting for a restart (one tap, no
 * store), then a newer build; a build notice the driver has dismissed for this version is not shown again until a newer one.
 */
export function chooseNotice(input: {
  readonly build: BuildStatus;
  readonly otaReady: boolean;
  readonly latestVersion: string | undefined;
  readonly updateUrl: string | undefined;
  readonly dismissedVersion: string | undefined;
}): UpdateNotice {
  if (input.build === 'required') return { kind: 'required', url: input.updateUrl };
  if (input.otaReady) return { kind: 'restart' };
  if (input.build === 'available' && input.dismissedVersion !== input.latestVersion) {
    return { kind: 'build', version: input.latestVersion, url: input.updateUrl };
  }
  return { kind: 'none' };
}
