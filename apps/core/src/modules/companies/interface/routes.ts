import { createCompanyRequestSchema } from '@wagonwise/contracts/companies';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { createCompany, type CreateCompanyDeps } from '../application/create-company.js';
import { listCompanies, type ListCompaniesDeps } from '../application/list-companies.js';
import type { Company } from '../domain/company.js';

/** Both use cases are admin-only (`application/company-authorization.ts`, P2-M1.8). */
export interface CompaniesRouteDeps {
  readonly createCompany: CreateCompanyDeps;
  readonly listCompanies: ListCompaniesDeps;
}

function companyDto(company: Company) {
  return { id: company.id, name: company.name, createdAt: company.createdAt.toISOString() };
}

/** The signed-in staff member, from `host/staff-auth.ts` (P2-M1.12c: these routes moved from
 *  driver tokens to staff tokens). 401 if there isn't one. */
function requireStaffId(request: FastifyRequest, reply: FastifyReply): Id<'StaffId'> | undefined {
  if (request.staffId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'StaffId'>(request.staffId);
}

/**
 * Admin-only, both routes — unlike hazards' confirm/dismiss (decision 63's "no ownership
 * check"), a company is business data with no legitimate reason for a non-admin to read
 * or create one. `requireStaffId` first (401, same as every other gated route); the admin check
 * (403) is the use cases' own (P2-M1.8), so a non-admin never learns whether any companies exist.
 */
export function registerCompaniesRoutes(app: FastifyInstance, deps: CompaniesRouteDeps): void {
  app.post('/staff/companies', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const parsed = createCompanyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await createCompany(deps.createCompany, {
      callerId: staffId,
      id: makeId<'CompanyId'>(parsed.data.id),
      name: parsed.data.name,
    });
    if (!result.ok) return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    return reply.status(201).send(companyDto(result.value));
  });

  app.get('/staff/companies', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const result = await listCompanies(deps.listCompanies, { callerId: staffId });
    if (!result.ok) return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    return reply.status(200).send({ companies: result.value.map(companyDto) });
  });
}
