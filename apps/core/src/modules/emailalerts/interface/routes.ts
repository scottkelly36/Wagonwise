import { emailProblemSchema } from '@wagonwise/contracts/email-events';
import type { FastifyInstance } from 'fastify';
import {
  reportEmailProblem,
  type ReportEmailProblemDeps,
} from '../application/report-email-problem.js';

export interface EmailAlertRouteDeps {
  readonly reportEmailProblem: ReportEmailProblemDeps;
}

/**
 * `POST /email-events`: the driver BFF has checked Resend's signature and passes on an email that did not get through. Not
 * a driver or staff route, so it is reached only with the internal key (the host's own gate). Always logged, masked; the
 * owner is emailed when an alert address is set. 204 whether or not an alert went, so Resend is not asked to resend.
 */
export function registerEmailAlertRoutes(app: FastifyInstance, deps: EmailAlertRouteDeps): void {
  app.post('/email-events', async (request, reply) => {
    const parsed = emailProblemSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const reported = await reportEmailProblem(deps.reportEmailProblem, parsed.data);
    request.log.warn({ emailProblem: reported }, 'an email did not get through');
    return reply.status(204).send();
  });
}
