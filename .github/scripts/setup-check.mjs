// Checks the pieces of the release setup that can be checked without publishing anything, and says
// what is wrong in plain words. Used by the workflow's "check" mode. Never prints a secret: only
// whether each is present and the public email of the Google service account.

/**
 * Looks at the text of the Google service account key (the JSON file downloaded from Google Cloud).
 * @returns {{ ok: boolean, email?: string, problem?: string }}
 */
export function inspectServiceAccount(text) {
  if (text === undefined || text.trim() === '') {
    return {
      ok: false,
      problem: 'The GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret is missing or empty.',
    };
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      ok: false,
      problem:
        'The GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret is not valid JSON. Paste the whole contents of the downloaded key file, from the first { to the last }.',
    };
  }
  if (json.type !== 'service_account') {
    return {
      ok: false,
      problem:
        'That JSON is not a service account key (it has no "type": "service_account"). Create a key for a service account, not an OAuth client.',
    };
  }
  if (typeof json.client_email !== 'string' || typeof json.private_key !== 'string') {
    return { ok: false, problem: 'The key is missing its client_email or private_key.' };
  }
  if (!json.private_key.includes('BEGIN PRIVATE KEY')) {
    return { ok: false, problem: 'The private_key in the file does not look like a private key.' };
  }
  return { ok: true, email: json.client_email };
}

/** Renders the check results as the run summary (markdown). */
export function renderSummary({ expoUser, expoProblem, account }) {
  const rows = [];
  rows.push(
    expoUser
      ? `- ✅ **Expo token** works: signed in as \`${expoUser}\`.`
      : `- ❌ **Expo token**: ${expoProblem ?? 'not checked'}`,
  );
  rows.push(
    account.ok
      ? `- ✅ **Google Play key** is a valid service account key for \`${account.email}\`. ` +
          `Check this is the email you invited under Users and permissions in Play Console.`
      : `- ❌ **Google Play key**: ${account.problem}`,
  );
  rows.push(
    '- ℹ️ Whether that account is allowed to release to the testing track can only be confirmed by a real ' +
      'upload. The first native release will say if Play refuses it.',
  );
  return `## Release setup check\n\n${rows.join('\n')}\n`;
}
