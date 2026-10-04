// Waits until the live server answers the way the new app needs, before an update is published.
//
// An over-the-air update reaches phones within minutes, while the server deploys separately and can
// finish later. An app that calls a route that is not live yet breaks for every driver (it nearly
// happened to the job "Start" button, which needed a new endpoint). The list of checks lives in
// .github/release/api-checks.txt: add a line whenever an app change depends on a new server route.
// The command-line wrapper is wait-for-api.mjs; this file is the testable part.

/**
 * One check per line: `METHOD /path EXPECTED_STATUS`, with `#` comments and blank lines ignored.
 * Checks are unauthenticated calls, so a route that exists answers 401 (not 404) and the expected
 * status says which.
 */
export function parseChecks(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [method, path, status] = line.split(/\s+/);
      if (!method || !path || !/^\d{3}$/.test(status ?? '')) {
        throw new Error(`Bad check line: "${line}". Expected: METHOD /path STATUS`);
      }
      return { method: method.toUpperCase(), path, status: Number(status) };
    });
}

async function statusOf(base, check) {
  const response = await fetch(new URL(check.path, base), { method: check.method });
  return response.status;
}

/**
 * Runs every check until all pass or the time is up. Returns the checks still failing (empty means
 * go). `fetchStatus`, `sleep` and `log` are parameters so the tests need no network and no waiting.
 */
export async function waitForChecks(
  base,
  checks,
  { timeoutMs, intervalMs, log = console.log, fetchStatus = statusOf, sleep, now = Date.now },
) {
  const pause = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + timeoutMs;
  for (;;) {
    const failing = [];
    for (const check of checks) {
      let got;
      try {
        got = await fetchStatus(base, check);
      } catch (error) {
        got = `no answer (${error instanceof Error ? error.message : String(error)})`;
      }
      if (got !== check.status) failing.push({ check, got });
    }
    if (failing.length === 0) return [];
    if (now() >= deadline) return failing;
    for (const { check, got } of failing) {
      log(`waiting: ${check.method} ${check.path} gave ${got}, wanted ${check.status}`);
    }
    await pause(intervalMs);
  }
}
