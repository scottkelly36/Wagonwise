/**
 * Architecture rules from AGENTS.md, enforced rather than reviewed.
 *
 * Path shape these rules assume (decided M1.2):
 *
 *   apps/core/src/shared/                    pure kernel: Result, branded IDs, cross-cutting ports
 *   apps/core/src/platform/                  adapters for the cross-cutting ports (clock, ids, ...)
 *   apps/core/src/host/                      the Fastify host: app builder, health, error mapping
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
      // Test files are exempt: a domain test importing vitest is fine, a domain file is not.
      from: { path: '(modules/[^/]+/domain/|src/shared/)', pathNot: '[.]test[.]ts$' },
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
      name: 'shared-imports-only-shared',
      severity: 'error',
      comment:
        'The shared kernel is the bottom of the graph. If it imports a module, the platform or ' +
        'the host, every module transitively depends on that thing and the layering is gone.',
      from: { path: 'src/shared/' },
      to: { path: 'src/(modules|platform|host|composition)/' },
    },
    {
      name: 'platform-no-inward',
      severity: 'error',
      comment:
        'Cross-cutting adapters implement shared ports and nothing more. They must not know that ' +
        'a bounded context, the HTTP host or the composition root exists.',
      from: { path: 'src/platform/' },
      to: { path: 'src/(modules|host|composition)/' },
    },
    {
      name: 'modules-no-outward',
      severity: 'error',
      comment:
        'AGENTS.md rules 3 and 5: a module receives its dependencies from the composition root; ' +
        'it never reaches for a concrete platform adapter, the HTTP host or the wiring itself.',
      from: { path: 'src/modules/' },
      to: { path: 'src/(platform|host|composition)/' },
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
    {
      name: 'modules-reachable-only-through-api',
      severity: 'error',
      comment:
        'AGENTS.md rule 6, the other half of no-cross-module-internals: that rule only fires ' +
        'when the importer is itself under modules/, so composition/, host/ and anything else ' +
        "outside modules/ could reach past a module's api.ts and this ruleset would say nothing " +
        '— found by testing a deliberately-bad composition/ fixture against the config, M1.4.',
      from: { path: '^(?!.*modules/).*$' },
      to: { path: 'modules/[^/]+/(domain|application|infrastructure|interface)/' },
    },
  ],
  options: {
    // doNotFollow keeps the edge in the graph (so the npm-dependency rules can see it)
    // while refusing to walk into the package. Do NOT put node_modules in `exclude`:
    // that deletes the edge and the domain-purity rules would pass silently forever.
    doNotFollow: { path: 'node_modules' },
    // Fixtures are excluded by not being cruised (the root script targets apps/ only),
    // not here — the tests need to cruise them.
    // Exclude this project's own build output only. The negative lookahead is essential: most npm
    // packages ship their entry point under dist/ or lib/, so a plain "dist" exclude deletes the
    // import edge for them and the npm-purity rules silently stop seeing those packages.
    exclude: { path: '^(?!.*node_modules/).*(?:^|/)(?:dist|coverage)(?:/|$)' },
    tsPreCompilationDeps: true,
    // Without exportsFields/conditionNames, package subpath imports ("vitest/config", "zod/v4")
    // resolve to nothing, fail no-unresolvable, and teach people to ignore that rule.
    enhancedResolveOptions: {
      // .tsx added for apps/driver-app (M5) — the first app with JSX; every prior app/package
      // was plain .ts, so this extension was never needed until a .tsx file imported another
      // .tsx file (apps/driver-app/src/app/profiles/{new,[id]}.tsx importing
      // components/vehicle-profile-form.tsx), caught for real by pnpm arch, not anticipated.
      extensions: ['.ts', '.tsx', '.js', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
