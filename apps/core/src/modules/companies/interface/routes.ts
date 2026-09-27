import { createCompanyRequestSchema } from '@wagonwise/contracts/companies';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { createCompany, type CreateCompanyDeps } from '../application/create-company.js';
import type { AdminDirectory } from '../application/ports/admin-directory.js';
import type { Company } from '../domain/company.js';
import type { CompanyRepository } from '../application/ports/company-repository.js';

export interface CompaniesRouteDeps {
  readonly createCompany: CreateCompanyDeps;
  readonly companyRepo: Pick<CompanyRepository, 'findAll'>;
  /** Gates both routes — companies are business/admin data, never driver-facing (design decision,
   *  2026-09-27: the whole point is an admin dashboard creating and listing them). */
  readonly adminDirectory: AdminDirectory;
}

function companyDto(company: Company) {
  return { id: company.id, name: company.name, createdAt: company.createdAt.toISOString() };
}

/** Duplicated from every other module's own `requireDriverId` rather than shared (AGENTS.md
 *  rule 6) — see hazards'/routing's copies for the full reasoning. */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

/**
 * Admin-only, both routes — unlike hazards' confirm/dismiss (decision 63's "no ownership
 * check"), a company is business data with no legitimate reason for a non-admin driver to read
 * or create one. `requireDriverId` first (401, same as every other gated route), then the admin
 * check (403) — a non-admin never learns whether any companies exist.
 */
export function registerCompaniesRoutes(app: FastifyInstance, deps: CompaniesRouteDeps): void {
  app.post('/companies', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    if (!(await deps.adminDirectory.isAdmin(driverId))) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const parsed = createCompanyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const company = await createCompany(deps.createCompany, {
      id: makeId<'CompanyId'>(parsed.data.id),
      name: parsed.data.name,
    });
    return reply.status(201).send(companyDto(company));
  });

  app.get('/companies', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    if (!(await deps.adminDirectory.isAdmin(driverId))) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const companies = await deps.companyRepo.findAll();
    return reply.status(200).send({ companies: companies.map(companyDto) });
  });
}
