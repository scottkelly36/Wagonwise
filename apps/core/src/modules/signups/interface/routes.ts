import {
  removeSignupRequestSchema,
  signupRequestSchema,
  testerIdParamsSchema,
} from '@wagonwise/contracts/signups';
import type { FastifyInstance } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  deleteTester,
  listTesters,
  removeMe,
  signUp,
  type CallerDirectory,
  type SignupDeps,
} from '../application/signups.js';

export interface SignupRouteDeps {
  readonly signups: SignupDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

/**
 * The landing page's sign-up, and WagonWise staff's list of it. The two public routes take no sign-in (they are for people
 * who have no account) and say nothing about who is on the list: the same answer whether or not an address was already
 * there. They run in the platform scope for that one write, after the request has been checked. The list and delete are for
 * WagonWise staff only, checked in the use case.
 */
export function registerSignupRoutes(app: FastifyInstance, deps: SignupRouteDeps): void {
  app.post('/signups', async (request, reply) => {
    const body = signupRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    // The trap field: a person never sees it. Look as if it worked, store nothing.
    if (body.data.website !== undefined && body.data.website.trim() !== '') {
      return reply.status(204).send();
    }
    const result = await deps.dataScopes.run({ kind: 'platform' }, () =>
      signUp(deps.signups, body.data),
    );
    if (result.ok) return reply.status(204).send();
    return reply
      .status(result.error.tag === 'TooManySignups' ? 429 : 400)
      .send({ ...result.error, requestId: request.id });
  });

  app.post('/signups/remove', async (request, reply) => {
    const body = removeSignupRequestSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    await deps.dataScopes.run({ kind: 'platform' }, () => removeMe(deps.signups, body.data.email));
    return reply.status(204).send();
  });

  app.get('/staff/signups', async (request, reply) => {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null || caller.kind !== 'platform') {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }
    const result = await deps.dataScopes.run({ kind: 'platform' }, () =>
      listTesters(deps.signups, caller),
    );
    if (!result.ok) return reply.status(403).send({ ...result.error, requestId: request.id });
    return reply.status(200).send({
      total: result.value.total,
      testers: result.value.testers.map((t) => ({
        id: t.id,
        email: t.email,
        ...(t.name === undefined ? {} : { name: t.name }),
        role: t.role,
        ...(t.company === undefined ? {} : { company: t.company }),
        ...(t.fleetSize === undefined ? {} : { fleetSize: t.fleetSize }),
        createdAt: t.createdAt.toISOString(),
      })),
    });
  });

  app.delete('/staff/signups/:id', async (request, reply) => {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const params = testerIdParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null || caller.kind !== 'platform') {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }
    const result = await deps.dataScopes.run({ kind: 'platform' }, () =>
      deleteTester(deps.signups, caller, makeId<'TesterId'>(params.data.id)),
    );
    if (result.ok) return reply.status(204).send();
    return reply
      .status(result.error.tag === 'NotFound' ? 404 : 403)
      .send({ ...result.error, requestId: request.id });
  });
}
