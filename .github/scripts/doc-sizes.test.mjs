import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Why this exists: the docs an assistant reads at the start of a session cost tokens every single time. They
// grew until progress.md was ~10,000 tokens of dated log and the README held every module's reference. This keeps
// each doc under a limit and tells you where to move things, so it is a decision rather than slow creep.
// Run with `pnpm test:ci-scripts` (and by the pre-push hook).

const root = fileURLToPath(new URL('../../', import.meta.url));
const lines = (path) => readFileSync(root + path, 'utf8').split('\n').length;
const chars = (path) => readFileSync(root + path, 'utf8').length;

/** Docs read at the start of work: each has a line limit, and the three read every session share a total. */
const LIMITS = [
  { path: 'CLAUDE.md', maxLines: 30, fix: 'it is only a pointer to AGENTS.md; put detail there' },
  { path: 'AGENTS.md', maxLines: 200, fix: 'move detail to docs/ and link to it' },
  {
    path: 'docs/progress.md',
    maxLines: 150,
    fix: 'move dated entries to docs/history/log.md and finished work to docs/history/<milestone>.md',
  },
  {
    path: 'README.md',
    maxLines: 400,
    fix: 'it is for getting the project running; put per-module reference in docs/modules.md',
  },
  { path: 'docs/ideas.md', maxLines: 400, fix: 'move shipped ideas to docs/history/log.md' },
  {
    path: 'docs/deployment-guide.md',
    maxLines: 650,
    fix: 'move retired steps and past incidents to docs/history/',
  },
];

/** The history files are archives, opened only when working in that area, so they have a looser cap each. */
const HISTORY_MAX_LINES = 1000;

/** CLAUDE.md, AGENTS.md and progress.md are read every session: about 4 characters to a token. */
const ALWAYS_READ = ['CLAUDE.md', 'AGENTS.md', 'docs/progress.md'];
const ALWAYS_READ_MAX_CHARS = 28_000;

describe('doc sizes', () => {
  for (const { path, maxLines, fix } of LIMITS) {
    it(`${path} stays under ${maxLines} lines`, () => {
      const n = lines(path);
      assert.ok(n <= maxLines, `${path} is ${n} lines (limit ${maxLines}): ${fix}.`);
    });
  }

  it('the docs read every session stay small together', () => {
    const total = ALWAYS_READ.reduce((sum, path) => sum + chars(path), 0);
    assert.ok(
      total <= ALWAYS_READ_MAX_CHARS,
      `${ALWAYS_READ.join(', ')} are ${total} characters together (about ${Math.round(total / 4)} tokens, limit ` +
        `${ALWAYS_READ_MAX_CHARS}): shorten them, or move detail into docs/history/.`,
    );
  });

  for (const file of readdirSync(root + 'docs/history').filter((f) => f.endsWith('.md'))) {
    it(`docs/history/${file} stays under ${HISTORY_MAX_LINES} lines`, () => {
      const n = lines(`docs/history/${file}`);
      assert.ok(
        n <= HISTORY_MAX_LINES,
        `docs/history/${file} is ${n} lines (limit ${HISTORY_MAX_LINES}): split it by sub-milestone.`,
      );
    });
  }
});
