import { createCompanyRequestSchema } from '@wagonwise/contracts/companies';
import {
  createFleetVehicleRequestSchema,
  driverLinkIdParamsSchema,
  fleetCompanyIdParamsSchema,
  fleetVehicleIdParamsSchema,
  inviteDriverRequestSchema,
  updateFleetVehicleRequestSchema,
} from '@wagonwise/contracts/fleet';
import { hazardReportIdParamsSchema } from '@wagonwise/contracts/hazards';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateOrReject } from './auth/authenticate.js';
import type { CoreMethod } from './core-client.js';
import type { StaffRouteDeps } from './staff-routes.js';

const noParams = z.object({});

interface Forward {
  readonly method: CoreMethod;
  /** Fastify's pattern; core serves the same path, with the validated params filled in. */
  readonly path: string;
  readonly params: z.ZodType<Record<string, string>>;
  readonly body?: z.ZodType;
}

/** The dashboard's pages that moved from the driver sign-in to staff accounts (P2-M1.12c). */
const FORWARDS: readonly Forward[] = [
  // WagonWise admins only; core decides.
  { method: 'GET', path: '/staff/companies', params: noParams },
  { method: 'POST', path: '/staff/companies', params: noParams, body: createCompanyRequestSchema },
  { method: 'GET', path: '/staff/invite-codes', params: noParams },
  { method: 'POST', path: '/staff/invite-codes', params: noParams },
  { method: 'GET', path: '/staff/hazard-reports', params: noParams },
  { method: 'DELETE', path: '/staff/hazard-reports/:id', params: hazardReportIdParamsSchema },
  // A company's own vehicles, for "Manage fleet" (or any company, for WagonWise admins).
  {
    method: 'GET',
    path: '/staff/fleet/companies/:companyId/vehicles',
    params: fleetCompanyIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/companies/:companyId/vehicles',
    params: fleetCompanyIdParamsSchema,
    body: createFleetVehicleRequestSchema,
  },
  {
    method: 'PUT',
    path: '/staff/fleet/vehicles/:id',
    params: fleetVehicleIdParamsSchema,
    body: updateFleetVehicleRequestSchema,
  },
  { method: 'DELETE', path: '/staff/fleet/vehicles/:id', params: fleetVehicleIdParamsSchema },
  // Driver links and the company code (P2-M2.6): a company's own roster, for "Manage fleet".
  {
    method: 'GET',
    path: '/staff/fleet/companies/:companyId/driver-links',
    params: fleetCompanyIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/companies/:companyId/driver-links',
    params: fleetCompanyIdParamsSchema,
    body: inviteDriverRequestSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/driver-links/:id/approve',
    params: driverLinkIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/driver-links/:id/decline',
    params: driverLinkIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/driver-links/:id/remove',
    params: driverLinkIdParamsSchema,
  },
  {
    method: 'GET',
    path: '/staff/fleet/companies/:companyId/code',
    params: fleetCompanyIdParamsSchema,
  },
  {
    method: 'POST',
    path: '/staff/fleet/companies/:companyId/code/regenerate',
    params: fleetCompanyIdParamsSchema,
  },
];

function corePath(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? ''));
}

/**
 * Same shape as `staff-routes.ts`: a valid staff token (401 without one), the contract's shape
 * checks (400, core never called), then core's answer relayed unchanged. Who may see or change
 * what is core's decision, not this BFF's (AGENTS.md rule 10).
 */
export function registerDashboardRoutes(app: FastifyInstance, deps: StaffRouteDeps): void {
  for (const forward of FORWARDS) {
    app.route({
      method: forward.method,
      url: forward.path,
      handler: async (request, reply) => {
        const token = await authenticateOrReject(request, reply, deps.staffTokenVerifier);
        if (token === undefined) return reply;
        const params = forward.params.safeParse(request.params ?? {});
        const body = forward.body?.safeParse(request.body);
        if (!params.success || (body !== undefined && !body.success)) {
          return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
        }
        const core = await deps.coreClient.request(
          forward.method,
          corePath(forward.path, params.data),
          request.id,
          {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { body: body.data }),
          },
        );
        return reply.status(core.status).send(core.body);
      },
    });
  }
}
