import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AlertMailer } from '../application/report-email-problem.js';
import { registerEmailAlertRoutes } from './routes.js';

function build() {
  const sent: string[] = [];
  const mailer: AlertMailer = {
    send: (subject) => {
      sent.push(subject);
      return Promise.resolve();
    },
  };
  const app = Fastify();
  registerEmailAlertRoutes(app, {
    reportEmailProblem: {
      mailer,
      alertAddress: 'owner@example.com',
      limiter: { tryAcquire: () => true },
    },
  });
  return { app, sent };
}

describe('POST /email-events', () => {
  it('204s and emails the owner for a bounced email', async () => {
    const { app, sent } = build();
    const response = await app.inject({
      method: 'POST',
      url: '/email-events',
      payload: { type: 'email.bounced', emailId: 'em_1', recipients: ['dave@gmail.com'] },
    });
    expect(response.statusCode).toBe(204);
    expect(sent).toHaveLength(1);
  });

  it('400s a body it does not recognise, including an event type that is not a problem', async () => {
    const { app, sent } = build();
    for (const payload of [
      { nonsense: true },
      { type: 'email.delivered', emailId: 'em_1', recipients: [] },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/email-events', payload });
      expect(response.statusCode).toBe(400);
    }
    expect(sent).toHaveLength(0);
  });
});
