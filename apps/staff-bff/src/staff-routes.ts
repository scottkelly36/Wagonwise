import {
  acceptStaffInviteRequestSchema,
  confirmStaffEnrolmentRequestSchema,
  createStaffInviteRequestSchema,
  listStaffQuerySchema,
  setStaffPrivilegesRequestSchema,
  staffIdParamsSchema,
  staffRefreshTokenRequestSchema,
  staffSignInRequestSchema,
  staffVerifySecondFactorRequestSchema,
} from '@wagonwise/contracts/staff';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { authenticateOrReject } from './auth/authenticate.js';
import type { StaffTokenVerifier } from './auth/staff-token-verifier.js';
import type { CoreClient, CoreResponse } from './core-client.js';

export interface StaffRouteDeps {
  readonly coreClient: CoreClient;
  readonly staffTokenVerifier: StaffTokenVerifier;
}

function invalid(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
}

function relay(reply: FastifyReply, core: CoreResponse) {
  return reply.status(core.status).send(core.body);
}

/** Before there's a token: validated against the same contracts core uses, then forwarded. */
const PUBLIC_POSTS: ReadonlyArray<readonly [path: string, schema: z.ZodType]> = [
  ['/staff/auth/sign-in', staffSignInRequestSchema],
  ['/staff/auth/second-factor', staffVerifySecondFactorRequestSchema],
  ['/staff/auth/refresh', staffRefreshTokenRequestSchema],
  ['/staff/auth/sign-out', staffRefreshTokenRequestSchema],
  ['/staff/invites/accept', acceptStaffInviteRequestSchema],
  ['/staff/invites/confirm', confirmStaffEnrolmentRequestSchema],
];

/**
 * The dashboard's staff routes (P2-M1.9): shape checks, a local staff-token check, forwarding,
 * nothing else (AGENTS.md rule 10). Who may do what (privileges, the company boundary, the last
 * manager rule) is decided by core, and enforced again by its database (P2-M1.7). Status and
 * body come back from core unchanged.
 */
export function registerStaffRoutes(app: FastifyInstance, deps: StaffRouteDeps): void {
  for (const [path, schema] of PUBLIC_POSTS) {
    app.post(path, async (request, reply) => {
      const body = schema.safeParse(request.body);
      if (!body.success) return invalid(request, reply);
      return relay(
        reply,
        await deps.coreClient.request('POST', path, request.id, { body: body.data }),
      );
    });
  }

  // ---- Signed in: a valid staff token first (401 without one), then shape checks. ----------

  app.get('/staff/me', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.staffTokenVerifier);
    if (token === undefined) return reply;
    return relay(
      reply,
      await deps.coreClient.request('GET', '/staff/me', request.id, {
        authorization: `Bearer ${token}`,
      }),
    );
  });

  app.post('/staff/invites', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.staffTokenVerifier);
    if (token === undefined) return reply;
    const body = createStaffInviteRequestSchema.safeParse(request.body);
    if (!body.success) return invalid(request, reply);
    return relay(
      reply,
      await deps.coreClient.request('POST', '/staff/invites', request.id, {
        body: body.data,
        authorization: `Bearer ${token}`,
      }),
    );
  });

  app.get('/staff/members', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.staffTokenVerifier);
    if (token === undefined) return reply;
    const query = listStaffQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(request, reply);
    const path =
      query.data.companyId === undefined
        ? '/staff/members'
        : `/staff/members?companyId=${encodeURIComponent(query.data.companyId)}`;
    return relay(
      reply,
      await deps.coreClient.request('GET', path, request.id, { authorization: `Bearer ${token}` }),
    );
  });

  app.put('/staff/members/:id/privileges', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.staffTokenVerifier);
    if (token === undefined) return reply;
    const params = staffIdParamsSchema.safeParse(request.params);
    const body = setStaffPrivilegesRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(request, reply);
    return relay(
      reply,
      await deps.coreClient.request(
        'PUT',
        `/staff/members/${params.data.id}/privileges`,
        request.id,
        { body: body.data, authorization: `Bearer ${token}` },
      ),
    );
  });

  app.delete('/staff/members/:id', async (request, reply) => {
    const token = await authenticateOrReject(request, reply, deps.staffTokenVerifier);
    if (token === undefined) return reply;
    const params = staffIdParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(request, reply);
    return relay(
      reply,
      await deps.coreClient.request('DELETE', `/staff/members/${params.data.id}`, request.id, {
        authorization: `Bearer ${token}`,
      }),
    );
  });
}
