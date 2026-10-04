import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NATIVE_RELEASE_LABEL, decideRelease, parseVersion } from './release-decision.mjs';

const app = ['apps/driver-app/src/app/job.tsx'];

describe('parseVersion', () => {
  it('reads the version out of app.config.ts', () => {
    const source =
      "const config = {\n  name: 'x',\n  version: '1.2.0',\n  orientation: 'portrait',\n};";
    assert.equal(parseVersion(source), '1.2.0');
  });

  it('is undefined when there is none', () => {
    assert.equal(parseVersion('const nothing = 1;'), undefined);
    assert.equal(parseVersion(undefined), undefined);
  });
});

describe('decideRelease: manual modes', () => {
  const base = { changedFiles: [], versionBefore: '1.0.0', versionAfter: '1.0.0', labels: [] };

  it('does exactly what was asked, whatever changed', () => {
    for (const mode of ['check', 'update', 'build']) {
      assert.equal(decideRelease({ ...base, mode }).kind, mode);
    }
  });
});

describe('decideRelease: a merge to main', () => {
  const merge = { mode: 'auto', versionBefore: '1.1.0', versionAfter: '1.1.0', labels: [] };

  it('does nothing for changes outside the app', () => {
    const result = decideRelease({
      ...merge,
      changedFiles: [
        'apps/core/src/modules/jobs/api.ts',
        'apps/dashboard/src/App.tsx',
        'docs/progress.md',
      ],
    });
    assert.equal(result.kind, 'none');
  });

  it('does nothing for tests and docs inside the app', () => {
    const result = decideRelease({
      ...merge,
      changedFiles: ['apps/driver-app/src/lib/job-entry.test.ts', 'apps/driver-app/README.md'],
    });
    assert.equal(result.kind, 'none');
  });

  it('publishes an update for a JavaScript-only change', () => {
    const result = decideRelease({ ...merge, changedFiles: app });
    assert.equal(result.kind, 'update');
    assert.deepEqual(result.warnings, []);
  });

  it('treats a contracts change as an app change, since the app bundles them', () => {
    const result = decideRelease({ ...merge, changedFiles: ['packages/contracts/src/jobs.ts'] });
    assert.equal(result.kind, 'update');
  });

  it('builds when the version was raised and the pull request carries the label', () => {
    const result = decideRelease({
      ...merge,
      versionAfter: '1.2.0',
      labels: [NATIVE_RELEASE_LABEL, 'something-else'],
      changedFiles: [...app, 'apps/driver-app/app.config.ts'],
    });
    assert.equal(result.kind, 'build');
    assert.match(result.reason, /1\.1\.0 to 1\.2\.0/);
  });

  it('never builds on a version bump alone: it says why and does nothing', () => {
    const result = decideRelease({
      ...merge,
      versionAfter: '1.2.0',
      changedFiles: [...app, 'apps/driver-app/app.config.ts'],
    });
    assert.equal(result.kind, 'none');
    assert.match(result.reason, /no release-android label/);
  });

  it('does not publish a JavaScript update to a version nobody has installed', () => {
    const result = decideRelease({ ...merge, versionAfter: '1.2.0', changedFiles: app });
    assert.notEqual(result.kind, 'update');
  });

  it('ignores the label when the version did not change, and says so', () => {
    const result = decideRelease({ ...merge, labels: [NATIVE_RELEASE_LABEL], changedFiles: app });
    assert.equal(result.kind, 'update');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /label was ignored/);
  });

  it('warns when native-looking files changed without a version bump', () => {
    const result = decideRelease({
      ...merge,
      changedFiles: [...app, 'apps/driver-app/package.json'],
    });
    assert.equal(result.kind, 'update');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /apps\/driver-app\/package\.json/);
  });
});
