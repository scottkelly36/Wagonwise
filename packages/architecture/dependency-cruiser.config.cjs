/**
 * Architecture rules from AGENTS.md, enforced rather than reviewed.
 *
 * Path shape these rules assume (decided M1.2):
 *
 *   apps/core/src/shared/                    pure kernel: Result, branded IDs
 *   apps/core/src/modules/<context>/api.ts   the module's only public surface
 *   apps/core/src/modules/<context>/domain/
 *   apps/core/src/modules/<context>/application/
 *   apps/core/src/modules/<context>/infrastructure/
 *   apps/core/src/modules/<context>/interface/
 *   apps/core/src/composition/               wires modules together via api.ts only
 *
 * Layers live inside each module, not above them, so a bounded context is one
 * folder you can read top to bottom.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies make load order undefined and usually mean a missing abstraction.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment:
        'An import that cannot be resolved is classed "unknown", which none of the purity rules ' +
        'match — so without this rule a domain file importing a package that is not installed ' +
        '(or a typo) would pass every other check. Fail closed.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'domain-no-outer-layers',
      severity: 'error',
      comment:
        'AGENTS.md rule 1: dependencies point inward only. The domain must not know that an ' +
        'application, an adapter or an HTTP route exists.',
      from: { path: 'modules/[^/]+/domain/' },
      to: { path: 'modules/[^/]+/(application|infrastructure|interface)/' },
    },
    {
      name: 'domain-no-npm-dependencies',
      severity: 'error',
      comment:
        'AGENTS.md rule 2: the domain is pure TypeScript with no npm dependencies at all — not ' +
        'even type-only ones. That is what keeps domain tests instant and the rules portable.',
      from: { path: '(modules/[^/]+/domain/|src/shared/)' },
      to: {
        // Every npm classification, including undeclared imports (npm-no-pkg / npm-unknown),
        // which are worse than declared ones, not better.
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'npm-no-pkg',
          'npm-unknown',
        ],
      },
    },
    {
      name: 'domain-no-node-builtins',
      severity: 'error',
      comment:
        'AGENTS.md rules 2 and 3: node builtins are I/O, and I/O belongs behind a port. A domain ' +
        'that reads the clock or the filesystem directly cannot be tested deterministically.',
      from: { path: '(modules/[^/]+/domain/|src/shared/)' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'application-no-outer-layers',
      severity: 'error',
      comment:
        'AGENTS.md rules 1 and 3: the application layer defines ports; it must never reach for a ' +
        'concrete adapter or an HTTP route.',
      from: { path: 'modules/[^/]+/application/' },
      to: { path: 'modules/[^/]+/(infrastructure|interface)/' },
    },
    {
      name: 'interface-no-infrastructure',
      severity: 'error',
      comment:
        'AGENTS.md rule 5: routes receive their dependencies from the composition root. A route ' +
        'that constructs its own adapter cannot be tested without a database.',
      from: { path: 'modules/[^/]+/interface/' },
      to: { path: 'modules/[^/]+/infrastructure/' },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'AGENTS.md rules 6 and 7: a bounded context is reachable only through its api.ts facade. ' +
        'Cross-context reads go through a read-model port owned by the consuming context.',
      from: { path: 'modules/([^/]+)/' },
      to: {
        path: 'modules/[^/]+/(domain|application|infrastructure|interface)/',
        pathNot: 'modules/$1/',
      },
    },
  ],
  options: {
    // doNotFollow keeps the edge in the graph (so the npm-dependency rules can see it)
    // while refusing to walk into the package. Do NOT put node_modules in `exclude`:
    // that deletes the edge and the domain-purity rules would pass silently forever.
    doNotFollow: { path: 'node_modules' },
    // Fixtures are excluded by not being cruised (the root script targets apps/ only),
    // not here — the tests need to cruise them.
    exclude: { path: '(^|/)(dist|coverage)(/|$)' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.json'] },
  },
};
