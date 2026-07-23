/**
 * Architecture tests: enforce the hexagonal dependency rule.
 *
 *   domain  ←  application  ←  infrastructure  ←  main.ts (composition root)
 *
 * Inner layers must never depend on outer layers.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-must-stay-pure',
      comment: 'The domain layer must not depend on application, infrastructure or node built-ins.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(application|infrastructure)|^src/main\\.ts$' },
    },
    {
      name: 'domain-no-external-deps',
      comment: 'The domain layer must not depend on npm packages or node core modules.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { dependencyTypes: ['npm', 'core'] },
    },
    {
      name: 'application-independent-of-infrastructure',
      comment: 'Use cases depend on ports (interfaces), never on adapters.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/infrastructure|^src/main\\.ts$' },
    },
    {
      name: 'application-no-framework-deps',
      comment: 'The application layer must not depend on frameworks (npm packages).',
      severity: 'error',
      from: { path: '^src/application' },
      to: { dependencyTypes: ['npm'] },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Every module must be reachable from the composition root.',
      severity: 'error',
      from: { orphan: true, pathNot: ['\\.d\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
