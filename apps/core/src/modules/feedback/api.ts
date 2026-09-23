import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresFeedbackNoteRepository } from './infrastructure/postgres-feedback-note-repository.js';
import { registerFeedbackRoutes, type FeedbackRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';

export interface FeedbackModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface FeedbackModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `feedback`'s only public surface (AGENTS.md rule 6) — the smallest module in this codebase:
 * one aggregate, one use case, no cross-context reads or events (design doc §3: "its own small
 * module," a one-way channel to the developer with nothing else in the domain depending on it).
 */
export function createFeedbackModule(deps: FeedbackModuleDeps): FeedbackModule {
  const repo = new PostgresFeedbackNoteRepository(deps.db);

  const routeDeps: FeedbackRouteDeps = {
    submitFeedback: { repo, clock: deps.clock, ids: deps.ids },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerFeedbackRoutes(app, routeDeps);
    },
  };
}
