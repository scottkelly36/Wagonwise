import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise, type IConfiguration, type IViolation } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ruleSet = require('../dependency-cruiser.config.cjs') as IConfiguration;

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));

async function violationsIn(dir: string): Promise<IViolation[]> {
  const result = await cruise([dir], { ruleSet, validate: true, tsPreCompilationDeps: true });
  if (typeof result.output === 'string') throw new Error('expected object output');
  return result.output.summary.violations;
}

/**
 * Each fixture is deliberately broken in exactly one way. Asserting the *precise* rule
 * name (not just "some violation") is what proves each rule fires for its own reason and
 * that a refactor of one rule can't quietly take another one down with it.
 */
const violating: ReadonlyArray<readonly [fixture: string, rule: string, why: string]> = [
  ['domain-imports-application', 'domain-no-outer-layers', 'domain reaching outward'],
  ['domain-imports-npm', 'domain-no-npm-dependencies', 'domain importing an npm package'],
  [
    'domain-imports-dist-package',
    'domain-no-npm-dependencies',
    'npm package whose entry point lives under dist/',
  ],
  ['shared-imports-npm', 'domain-no-npm-dependencies', 'shared kernel importing an npm package'],
  ['domain-imports-node-builtin', 'domain-no-node-builtins', 'domain importing node:crypto'],
  [
    'application-imports-infrastructure',
    'application-no-outer-layers',
    'use case newing up an adapter',
  ],
  ['interface-imports-infrastructure', 'interface-no-infrastructure', 'route newing up an adapter'],
  ['cross-module-internals', 'no-cross-module-internals', 'routing reaching past hazards/api.ts'],
  [
    'composition-imports-module-internals',
    'modules-reachable-only-through-api',
    'composition reaching past hazards/api.ts, the case no-cross-module-internals cannot see',
  ],
  ['circular', 'no-circular', 'two files importing each other'],
  ['shared-imports-module', 'shared-imports-only-shared', 'kernel reaching up into a module'],
  ['platform-imports-module', 'platform-no-inward', 'a platform adapter reaching into a module'],
  ['module-imports-platform', 'modules-no-outward', 'a module newing up a platform adapter'],
  [
    'test-file-exemption-is-narrow',
    'domain-no-npm-dependencies',
    'vitest imported from a non-test domain file',
  ],
  ['unresolvable-import', 'no-unresolvable', 'import of a package that is not installed'],
];

describe('architecture rules', () => {
  it('passes the clean reference fixture, including the allowed cross-module read', async () => {
    expect(await violationsIn(`${fixtures}clean`)).toEqual([]);
  });

  it.each(violating)('%s trips %s (%s)', async (fixture, rule) => {
    const violations = await violationsIn(`${fixtures}violations/${fixture}`);
    const rules = [...new Set(violations.map((v) => v.rule.name))];
    expect(rules).toEqual([rule]);
  });

  it('has a violating fixture for every forbidden rule', () => {
    const covered = new Set(violating.map(([, rule]) => rule));
    // An unnamed rule can never have a fixture, so it counts as uncovered.
    const declared = (ruleSet.forbidden ?? []).map((r) => r.name ?? '<unnamed rule>');
    expect(declared.filter((name) => !covered.has(name))).toEqual([]);
  });
});
