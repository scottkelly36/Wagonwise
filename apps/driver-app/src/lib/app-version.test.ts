import { buildStatus, chooseNotice, compareVersions, parseVersion } from './app-version';

describe('parseVersion', () => {
  it('reads numbers separated by dots, and nothing else', () => {
    expect(parseVersion('1.2.1')).toEqual([1, 2, 1]);
    expect(parseVersion(' 1.10 ')).toEqual([1, 10]);
    for (const bad of ['', '1.x', 'v1.2', '1..2', '1.2.1-beta', undefined, null]) {
      expect(parseVersion(bad)).toBeUndefined();
    }
  });
});

describe('compareVersions', () => {
  it('compares number by number, not as text, and a missing part is 0', () => {
    expect(compareVersions([1, 2, 1], [1, 3, 0])).toBeLessThan(0);
    expect(compareVersions([1, 10, 0], [1, 9, 0])).toBeGreaterThan(0);
    expect(compareVersions([1, 3], [1, 3, 0])).toBe(0);
    expect(compareVersions([2], [1, 9, 9])).toBeGreaterThan(0);
  });
});

describe('buildStatus', () => {
  it('is available below the newest, required below the oldest allowed, otherwise current', () => {
    expect(buildStatus('1.2.1', { latestVersion: '1.3.0' })).toBe('available');
    expect(buildStatus('1.3.0', { latestVersion: '1.3.0' })).toBe('current');
    expect(buildStatus('1.4.0', { latestVersion: '1.3.0' })).toBe('current');
    expect(buildStatus('1.2.1', { latestVersion: '1.3.0', minimumVersion: '1.3.0' })).toBe(
      'required',
    );
    expect(buildStatus('1.2.1', { latestVersion: '1.3.0', minimumVersion: '1.2.0' })).toBe(
      'available',
    );
  });

  it('says nothing when nothing is set or anything cannot be read, so a typo never locks a driver out', () => {
    expect(buildStatus('1.2.1', {})).toBe('current');
    expect(buildStatus('1.2.1', { latestVersion: 'soon', minimumVersion: '??' })).toBe('current');
    expect(buildStatus(undefined, { latestVersion: '9.9.9', minimumVersion: '9.9.9' })).toBe(
      'current',
    );
  });
});

describe('chooseNotice', () => {
  const base = {
    build: 'current' as const,
    otaReady: false,
    latestVersion: '1.3.0',
    updateUrl: 'https://store.example/app',
    dismissedVersion: undefined,
  };

  it('says nothing when nothing is new', () => {
    expect(chooseNotice(base)).toEqual({ kind: 'none' });
  });

  it('offers a restart when an update has been downloaded', () => {
    expect(chooseNotice({ ...base, otaReady: true })).toEqual({ kind: 'restart' });
  });

  it('points to the store for a newer build, until the driver dismisses that version', () => {
    expect(chooseNotice({ ...base, build: 'available' })).toEqual({
      kind: 'build',
      version: '1.3.0',
      url: 'https://store.example/app',
    });
    expect(chooseNotice({ ...base, build: 'available', dismissedVersion: '1.3.0' })).toEqual({
      kind: 'none',
    });
    // A still newer build shows again.
    expect(
      chooseNotice({
        ...base,
        build: 'available',
        latestVersion: '1.4.0',
        dismissedVersion: '1.3.0',
      }).kind,
    ).toBe('build');
  });

  it('puts a required update first, and it cannot be dismissed', () => {
    expect(
      chooseNotice({ ...base, build: 'required', otaReady: true, dismissedVersion: '1.3.0' }),
    ).toEqual({
      kind: 'required',
      url: 'https://store.example/app',
    });
  });

  it('prefers the one-tap restart to a store notice', () => {
    expect(chooseNotice({ ...base, build: 'available', otaReady: true }).kind).toBe('restart');
  });
});
