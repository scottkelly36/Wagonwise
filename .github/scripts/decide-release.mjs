// The driver app release workflow's first step: gathers the facts, asks release-decision.mjs what to
// do, and writes the answer for the later jobs and the run summary. Nothing here changes anything;
// it only reads and reports.
//
// "Release" means publishing the commit now checked out (main's tip, or the commit CI just passed),
// measured against the last commit that was released (the driver-app/production tag).
//
// Inputs (environment): MODE (release|update|build|check), TRIGGER (merge|label|manual),
// GH_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import {
  RELEASED_TAG,
  RELEASE_LABEL,
  ciPassed,
  decideRelease,
  parseVersion,
} from './release-decision.mjs';

const mode = process.env.MODE ?? 'release';
const trigger = process.env.TRIGGER ?? 'manual';
const repo = process.env.GITHUB_REPOSITORY;

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryRun(command, args) {
  try {
    return run(command, args);
  } catch {
    return undefined;
  }
}

function finish({ kind, text }) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\nsha=${target}\n`);
  }
}

const target = run('git', ['rev-parse', 'HEAD']);
const short = target.slice(0, 7);

// What is already in production
const baseline = tryRun('git', ['rev-parse', '--verify', `refs/tags/${RELEASED_TAG}^{commit}`]);

let labelled = false;
if (mode === 'release') {
  if (trigger === 'label') {
    labelled = true; // the event itself is the label being added
  } else {
    const names = tryRun('gh', [
      'api',
      `repos/${repo}/commits/${target}/pulls`,
      '--jq',
      '[.[].labels[].name]',
    ]);
    labelled = names !== undefined && JSON.parse(names).includes(RELEASE_LABEL);
  }
}

// Adding the label later releases main's tip, so it must have passed CI.
if (mode === 'release' && labelled && trigger === 'label') {
  const runsJson = tryRun('gh', [
    'run',
    'list',
    '--workflow',
    'CI',
    '--commit',
    target,
    '--json',
    'status,conclusion',
    '--limit',
    '10',
  ]);
  const verdict = ciPassed(runsJson ? JSON.parse(runsJson) : []);
  if (!verdict.ok) {
    finish({
      kind: 'none',
      text:
        `## Driver app release: not published\n\n${verdict.why} (main is at \`${short}\`). ` +
        `Nothing was published. Once CI is green on main, remove and re-add the \`${RELEASE_LABEL}\` label, ` +
        `or run this workflow by hand.\n`,
    });
    process.exit(0);
  }
}

if (mode === 'release' && labelled && baseline === undefined) {
  finish({
    kind: 'none',
    text:
      `## Driver app release: not published\n\nThere is no \`${RELEASED_TAG}\` tag, so there is no record of what ` +
      `is in production and what has changed since. Run this workflow by hand (mode "update" or "build") ` +
      `once; that creates the tag.\n`,
  });
  process.exit(0);
}

let changedFiles = [];
let versionReleased;
let log = [];
if (baseline !== undefined) {
  changedFiles = run('git', ['diff', '--name-only', baseline, target]).split('\n').filter(Boolean);
  versionReleased = parseVersion(
    tryRun('git', ['show', `${baseline}:apps/driver-app/app.config.ts`]),
  );
  log = run('git', ['log', '--oneline', '--max-count=20', `${baseline}..${target}`])
    .split('\n')
    .filter(Boolean);
}
const versionNow = parseVersion(tryRun('git', ['show', `${target}:apps/driver-app/app.config.ts`]));

const decision = decideRelease({ mode, labelled, changedFiles, versionReleased, versionNow });

const lines = [
  `## Driver app release: ${decision.kind}`,
  '',
  `${decision.reason}.`,
  '',
  `- Commit: \`${short}\``,
  ...(mode === 'release'
    ? [
        `- Last released: ${baseline ? `\`${baseline.slice(0, 7)}\`` : 'unknown'}`,
        `- App version: ${versionReleased ?? '?'} released, ${versionNow ?? '?'} now`,
        `- \`${RELEASE_LABEL}\` label: ${labelled ? 'yes' : 'no'}`,
      ]
    : []),
  '',
  ...(log.length > 0 && decision.kind !== 'none'
    ? [
        'Changes going out (everything on main since the last release):',
        '',
        ...log.map((l) => `- ${l}`),
        '',
      ]
    : []),
  ...decision.warnings.map((warning) => `> **Warning:** ${warning}`),
];
finish({ kind: decision.kind, text: lines.join('\n') + '\n' });
