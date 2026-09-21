import { readdirSync, readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * AGENTS.md rule 4: the process environment is read in exactly one place, config.ts.
 * Everything else takes a Config argument, which is what keeps tests free of global state.
 *
 * Best-effort text scan, not a proof: it cannot see `globalThis.process.env` or an aliased
 * `process`. It exists to catch the ordinary mistake, so the detector itself is tested below.
 */
const ENV_ACCESS = [
  /\bprocess\s*\.\s*env\b/,
  /\bprocess\s*\[\s*['"`]env['"`]\s*\]/,
  /\bconst\s*\{[^}]*\benv\b[^}]*\}\s*=\s*process\b/,
  /\bfrom\s+['"](?:node:)?process['"]/,
];

function readsProcessEnv(source: string): boolean {
  return ENV_ACCESS.some((pattern) => pattern.test(source));
}

describe('the process-environment detector', () => {
  it.each([
    ['dot access', 'const p = process.env.PORT;'],
    ['spaced dot access', 'const p = process . env.PORT;'],
    ['bracket access', "const p = process['env'].PORT;"],
    ['destructuring', 'const { env } = process;'],
    ['module import', "import { env } from 'node:process';"],
    ['bare module import', "import process from 'process';"],
  ])('catches %s', (_label, source) => {
    expect(readsProcessEnv(source)).toBe(true);
  });

  it.each([
    ['a config argument', 'const p = config.port;'],
    ['a variable merely named env', 'const env = { PORT: "1" };'],
    ['process.exit', 'process.exit(1);'],
    ['process.once', "process.once('SIGINT', stop);"],
  ])('leaves %s alone', (_label, source) => {
    expect(readsProcessEnv(source)).toBe(false);
  });
});

describe('AGENTS.md rule 4: process.env is read only in config.ts', () => {
  const srcDir = fileURLToPath(new URL('.', import.meta.url));
  const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((path) => path.split(sep).join('/'))
    .filter((path) => path.endsWith('.ts'))
    .filter((path) => path !== 'config.ts' && path !== 'conventions.test.ts');

  it('scans a meaningful number of files, so an empty scan cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('finds no other reader', () => {
    const offenders = files.filter((path) =>
      readsProcessEnv(readFileSync(`${srcDir}${path}`, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
