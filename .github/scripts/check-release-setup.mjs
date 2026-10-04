// "check" mode of the driver app release workflow: proves the secrets are present and usable without
// publishing or uploading anything. Needs EXPO_TOKEN and GOOGLE_PLAY_SERVICE_ACCOUNT_JSON in the
// environment, and `eas` on the PATH (the workflow installs it). Exits 1 if anything is wrong.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { inspectServiceAccount, renderSummary } from './setup-check.mjs';

let expoUser;
let expoProblem;
if (!process.env.EXPO_TOKEN) {
  expoProblem = 'The EXPO_TOKEN secret is not set.';
} else {
  try {
    expoUser = execFileSync('eas', ['whoami'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .at(-1);
  } catch {
    expoProblem =
      'Expo did not accept the token. Create a new one under Account settings, Access tokens, and update the secret.';
  }
}

const account = inspectServiceAccount(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
const summary = renderSummary({ expoUser, expoProblem, account });
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (!expoUser || !account.ok) process.exit(1);
