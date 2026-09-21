import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { buildApp } from '../host/build-app.js';
import { SystemClock } from '../platform/system-clock.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import type { Clock } from '../shared/ports/clock.js';
import type { IdGenerator } from '../shared/ports/id-generator.js';

/** Real adapters by default; tests substitute fakes here rather than mocking modules. */
export interface CoreOverrides {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}

export interface Core {
  readonly app: FastifyInstance;
}

/**
 * The composition root: the one place that knows which concrete adapter satisfies which port
 * (AGENTS.md rule 5). Manual wiring, no DI container. Each bounded context adds a
 * `createXModule(deps)` call here as it lands (identity in M1.5).
 */
export function composeCore(config: Config, overrides: CoreOverrides = {}): Core {
  const clock = overrides.clock ?? new SystemClock();
  const ids = overrides.ids ?? new UuidIdGenerator();

  const app = buildApp({ config, clock, ids });
  return { app };
}
