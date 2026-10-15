import {
  EMAIL_PROBLEM_TYPES,
  emailProblemSchema,
  type EmailProblemType,
} from '@wagonwise/contracts/email-events';
import type { FastifyInstance } from 'fastify';
import type { CoreClient } from './core-client.js';
import { verifyWebhook } from './webhook-signature.js';

export interface WebhooksRouteDeps {
  readonly coreClient: CoreClient;
  /** Resend's signing secret for this webhook. Unset: the route says it is not set up and does nothing. */
  readonly resendWebhookSecret: string | undefined;
  readonly nowSeconds: () => number;
}

const isProblemType = (type: unknown): type is EmailProblemType =>
  typeof type === 'string' && (EMAIL_PROBLEM_TYPES as readonly string[]).includes(type);

/** The first non-empty text found at any of these paths, for the reason Resend gives (it varies by event). */
function reasonFrom(data: Record<string, unknown>): string | undefined {
  for (const key of ['failed', 'bounce', 'suppressed']) {
    const part = data[key];
    if (typeof part === 'object' && part !== null) {
      for (const field of ['reason', 'message']) {
        const value = (part as Record<string, unknown>)[field];
        if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 500);
      }
    }
  }
  return undefined;
}

/**
 * `POST /webhooks/resend`: Resend tells us an email did not get through. Public on purpose (Resend has no login), so the
 * only protection is the signature: a request that does not carry a valid one is refused and nothing else is read. A valid
 * one is passed to core, which logs it and emails the owner. Events that are not problems are acknowledged and dropped. The
 * route answers 502 only when core could not be reached, so Resend tries again; everything else is a 2xx or a plain refusal.
 */
export function registerWebhooksRoutes(app: FastifyInstance, deps: WebhooksRouteDeps): void {
  // Its own scope, so only this route reads the body as raw text. The signature is over the exact bytes Resend sent, which a
  // parsed-and-reserialised body would not match.
  void app.register((scope, _options, done) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_request, body, next) => {
        next(null, body);
      },
    );

    scope.post('/webhooks/resend', async (request, reply) => {
      if (deps.resendWebhookSecret === undefined) {
        return reply.status(503).send({ error: 'webhook_not_configured', requestId: request.id });
      }
      const body = typeof request.body === 'string' ? request.body : '';
      const header = (name: string): string | undefined => {
        const value = request.headers[name];
        return typeof value === 'string' ? value : undefined;
      };
      const valid = verifyWebhook({
        secret: deps.resendWebhookSecret,
        headers: {
          id: header('svix-id'),
          timestamp: header('svix-timestamp'),
          signature: header('svix-signature'),
        },
        body,
        nowSeconds: deps.nowSeconds(),
      });
      if (!valid) {
        return reply.status(401).send({ error: 'invalid_signature', requestId: request.id });
      }

      let event: unknown;
      try {
        event = JSON.parse(body);
      } catch {
        return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
      }
      const type = (event as { type?: unknown } | null)?.type;
      if (!isProblemType(type)) return reply.status(204).send();

      const data = ((event as { data?: unknown }).data ?? {}) as Record<string, unknown>;
      const to = Array.isArray(data.to) ? data.to : typeof data.to === 'string' ? [data.to] : [];
      const problem = emailProblemSchema.safeParse({
        type,
        emailId: typeof data.email_id === 'string' ? data.email_id : 'unknown',
        recipients: to.filter((item): item is string => typeof item === 'string'),
        reason: reasonFrom(data),
      });
      if (!problem.success) {
        return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
      }

      try {
        const core = await deps.coreClient.request('POST', '/email-events', request.id, {
          body: problem.data,
        });
        if (core.status >= 500) {
          return reply.status(502).send({ error: 'core_unavailable', requestId: request.id });
        }
      } catch {
        return reply.status(502).send({ error: 'core_unavailable', requestId: request.id });
      }
      return reply.status(204).send();
    });

    done();
  });
}
