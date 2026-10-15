import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { AlertMailer } from './application/report-email-problem.js';
import { SlidingWindowAlertLimiter } from './infrastructure/sliding-window-alert-limiter.js';
import { registerEmailAlertRoutes } from './interface/routes.js';

export type { AlertMailer } from './application/report-email-problem.js';

export interface EmailAlertsModuleDeps {
  readonly clock: Clock;
  /** Sends the alert to the owner; absent when no alert address is set, so problems are only logged. */
  readonly mailer?: AlertMailer | undefined;
  /** The address the alerts go to. */
  readonly alertAddress?: string | undefined;
}

export interface EmailAlertsModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `emailalerts`' only public surface (AGENTS.md rule 6): hears from the driver BFF when Resend says an email did not get
 * through, logs it with the address masked, and emails the owner (at most a few an hour). Holds no data of its own.
 */
export function createEmailAlertsModule(deps: EmailAlertsModuleDeps): EmailAlertsModule {
  const limiter = new SlidingWindowAlertLimiter(deps.clock);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerEmailAlertRoutes(app, {
        reportEmailProblem: { mailer: deps.mailer, alertAddress: deps.alertAddress, limiter },
      });
    },
  };
}
