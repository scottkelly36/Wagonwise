import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RELEASE_LABEL, ciPassed, decideRelease, parseVersion } from './release-decision.mjs';

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
  const base = { labelled: false, changedFiles: [], versionReleased: '1.0.0', versionNow: '1.0.0' };

  it('does exactly what was asked, with or without the label, whatever changed', () => {
    for (const mode of ['check', 'update', 'build']) {
      assert.equal(decideRelease({ ...base, mode }).kind, mode);
    }
  });
});

describe('decideRelease: the release label', () => {
  const release = {
    mode: 'release',
    labelled: true,
    versionReleased: '1.1.0',
    versionNow: '1.1.0',
    changedFiles: app,
  };

  it('never publishes without the label, however much changed, and says how to', () => {
    const result = decideRelease({ ...release, labelled: false });
    assert.equal(result.kind, 'none');
    assert.match(result.reason, /no `release` label/);
    assert.match(result.reason, /before or after merging/);
  });

  it('publishes an update for a labelled JavaScript-only change', () => {
    const result = decideRelease(release);
    assert.equal(result.kind, 'update');
    assert.deepEqual(result.warnings, []);
  });

  it('builds when the version is higher than the last release', () => {
    const result = decideRelease({ ...release, versionNow: '1.2.0' });
    assert.equal(result.kind, 'build');
    assert.match(result.reason, /1\.1\.0 to 1\.2\.0/);
  });

  it('does nothing when nothing in the app changed since the last release', () => {
    const result = decideRelease({
      ...release,
      changedFiles: ['apps/core/src/modules/jobs/api.ts', 'docs/progress.md'],
    });
    assert.equal(result.kind, 'none');
    assert.match(result.reason, /since the last release/);
  });

  it('does nothing for tests and docs inside the app', () => {
    const result = decideRelease({
      ...release,
      changedFiles: ['apps/driver-app/src/lib/job-entry.test.ts', 'apps/driver-app/README.md'],
    });
    assert.equal(result.kind, 'none');
  });

  it('treats a contracts change as an app change, since the app bundles them', () => {
    const result = decideRelease({ ...release, changedFiles: ['packages/contracts/src/jobs.ts'] });
    assert.equal(result.kind, 'update');
  });

  it('counts everything since the last release, not just the labelled pull request', () => {
    // Two earlier unlabelled merges rode along: the diff since the tag includes them.
    const result = decideRelease({
      ...release,
      changedFiles: [...app, 'apps/driver-app/src/lib/job-entry.ts', 'docs/progress.md'],
    });
    assert.equal(result.kind, 'update');
  });

  it('warns when native-looking files changed without a version bump', () => {
    const result = decideRelease({
      ...release,
      changedFiles: [...app, 'apps/driver-app/package.json'],
    });
    assert.equal(result.kind, 'update');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /apps\/driver-app\/package\.json/);
  });

  it('uses the one label name the setup checklist tells the owner to create', () => {
    assert.equal(RELEASE_LABEL, 'release');
  });
});

describe('ciPassed', () => {
  it('passes when the newest run finished and succeeded', () => {
    assert.deepEqual(ciPassed([{ status: 'completed', conclusion: 'success' }]), { ok: true });
  });

  it('does not pass with no run, a run still going, or a failure', () => {
    assert.equal(ciPassed([]).ok, false);
    assert.match(ciPassed([{ status: 'in_progress', conclusion: null }]).why, /still running/);
    assert.match(
      ciPassed([{ status: 'completed', conclusion: 'failure' }]).why,
      /did not pass.*failure/,
    );
  });

  it('judges by the newest run: a re-run that passed beats an older failure', () => {
    const runs = [
      { status: 'completed', conclusion: 'success' },
      { status: 'completed', conclusion: 'failure' },
    ];
    assert.equal(ciPassed(runs).ok, true);
  });
});
