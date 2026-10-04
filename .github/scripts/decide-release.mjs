// The driver app release workflow's first step: gathers the facts about the commit that just landed
// on main (what changed, the app version before and after, the labels on its pull request), asks
// release-decision.mjs what to do, and writes the answer for the later jobs and the run summary.
//
// Inputs (environment): MODE (auto|update|build|check), HEAD_SHA, GH_TOKEN, GITHUB_REPOSITORY,
// GITHUB_OUTPUT, GITHUB_STEP_SUMMARY. Nothing here changes anything; it only reads and reports.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { decideRelease, parseVersion } from './release-decision.mjs';

const mode = process.env.MODE ?? 'auto';
const head = process.env.HEAD_SHA ?? 'HEAD';

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

let changedFiles = [];
let versionBefore;
let versionAfter;
let labels = [];

if (mode === 'auto') {
  // First-parent diff: for a squash merge this is the whole change, for a merge commit it is
  // everything the pull request brought in.
  const before = run('git', ['rev-parse', `${head}^1`]);
  changedFiles = run('git', ['diff', '--name-only', before, head]).split('\n').filter(Boolean);
  versionBefore = parseVersion(tryRun('git', ['show', `${before}:apps/driver-app/app.config.ts`]));
  versionAfter = parseVersion(tryRun('git', ['show', `${head}:apps/driver-app/app.config.ts`]));

  const repo = process.env.GITHUB_REPOSITORY;
  const labelJson = tryRun('gh', [
    'api',
    `repos/${repo}/commits/${head}/pulls`,
    '--jq',
    '[.[].labels[].name]',
  ]);
  labels = labelJson ? JSON.parse(labelJson) : [];
}

const decision = decideRelease({ mode, changedFiles, versionBefore, versionAfter, labels });

const lines = [
  `## Driver app release: ${decision.kind}`,
  '',
  `${decision.reason}.`,
  '',
  ...(mode === 'auto'
    ? [
        `- Commit: \`${head.slice(0, 7)}\``,
        `- App version: ${versionBefore ?? '?'} to ${versionAfter ?? '?'}`,
        `- Pull request labels: ${labels.length > 0 ? labels.map((l) => `\`${l}\``).join(', ') : 'none'}`,
        `- Changed files: ${changedFiles.length}`,
        '',
      ]
    : []),
  ...decision.warnings.map((warning) => `> **Warning:** ${warning}`),
];
const summary = lines.join('\n') + '\n';
console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `kind=${decision.kind}\n`);
}
