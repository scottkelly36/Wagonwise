import {
  checkTemplateIdParamsSchema,
  checksCompanyParamsSchema,
  createCheckTemplateRequestSchema,
  updateCheckSettingsRequestSchema,
  updateCheckTemplateRequestSchema,
} from '@wagonwise/contracts/checks';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import type { CallerDirectory, StaffCaller } from '../application/ports/directories.js';
import {
  getCheckSettings,
  updateCheckSettings,
  type CheckRulesDeps,
} from '../application/check-rules.js';
import {
  archiveTemplate,
  createTemplate,
  listTemplates,
  starterTemplate,
  updateTemplate,
  type Forbidden,
  type TemplateDeps,
  type TemplateNotFound,
  type VehicleNotInCompany,
} from '../application/templates.js';
import type { InvalidTemplate } from '../domain/check-template.js';
import { templateDto } from './dto.js';

export interface ChecksRouteDeps {
  readonly templates: TemplateDeps;
  readonly rules: CheckRulesDeps;
  readonly callerDirectory: CallerDirectory;
  /** Row-Level Security scope per request (migration 0043). */
  readonly dataScopes: DataScopes;
}

type ChecksError = Forbidden | TemplateNotFound | InvalidTemplate | VehicleNotInCompany;

function statusFor(error: ChecksError): number {
  switch (error.tag) {
    case 'InvalidTemplate':
    case 'VehicleNotInCompany':
      return 400;
    case 'Forbidden':
      return 403;
    case 'TemplateNotFound':
      return 404;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}

const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: ChecksError): Outcome => ({ status: statusFor(error), body: error });

function scopeFor(caller: StaffCaller): DataScope {
  return caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };
}

/**
 * The check lists a company builds for itself (the staff door; the driver's own door follows with the driver
 * app). Every use case checks the caller's own permission, and Row-Level Security refuses to even find another
 * company's list.
 */
export function registerChecksRoutes(app: FastifyInstance, deps: ChecksRouteDeps): void {
  async function asStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (caller: StaffCaller, staffId: string) => Promise<Outcome>,
  ) {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(makeId<'StaffId'>(request.staffId));
    const outcome =
      caller === null
        ? { status: 403, body: { tag: 'Forbidden' } }
        : await deps.dataScopes.run(scopeFor(caller), () =>
            work(caller, request.staffId as string),
          );
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  app.get('/staff/checks/companies/:companyId/settings', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checksCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await getCheckSettings(
        deps.rules,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok ? { status: 200, body: result.value } : { status: 403, body: result.error };
    }),
  );

  app.put('/staff/checks/companies/:companyId/settings', (request, reply) =>
    asStaff(request, reply, async (caller, staffId) => {
      const params = checksCompanyParamsSchema.safeParse(request.params);
      const body = updateCheckSettingsRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await updateCheckSettings(
        deps.rules,
        caller,
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        body.data,
      );
      return result.ok ? { status: 200, body: result.value } : { status: 403, body: result.error };
    }),
  );

  app.get('/staff/checks/starter', (request, reply) =>
    asStaff(request, reply, () =>
      Promise.resolve({ status: 200, body: starterTemplate(deps.templates) }),
    ),
  );

  app.get('/staff/checks/companies/:companyId/templates', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checksCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await listTemplates(
        deps.templates,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? { status: 200, body: { templates: result.value.map(templateDto) } }
        : failure(result.error);
    }),
  );

  app.post('/staff/checks/companies/:companyId/templates', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checksCompanyParamsSchema.safeParse(request.params);
      const body = createCheckTemplateRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await createTemplate(deps.templates, caller, {
        id: makeId<'CheckTemplateId'>(body.data.id),
        companyId: makeId<'CompanyId'>(params.data.companyId),
        name: body.data.name,
        appliesTo: body.data.appliesTo,
        vehicleIds: body.data.vehicleIds.map((v) => makeId<'FleetVehicleId'>(v)),
        items: body.data.items,
      });
      return result.ok ? { status: 201, body: templateDto(result.value) } : failure(result.error);
    }),
  );

  app.put('/staff/checks/templates/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checkTemplateIdParamsSchema.safeParse(request.params);
      const body = updateCheckTemplateRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await updateTemplate(
        deps.templates,
        caller,
        makeId<'CheckTemplateId'>(params.data.id),
        {
          name: body.data.name,
          appliesTo: body.data.appliesTo,
          vehicleIds: body.data.vehicleIds.map((v) => makeId<'FleetVehicleId'>(v)),
          items: body.data.items,
        },
      );
      return result.ok ? { status: 200, body: templateDto(result.value) } : failure(result.error);
    }),
  );

  app.delete('/staff/checks/templates/:id', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = checkTemplateIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await archiveTemplate(
        deps.templates,
        caller,
        makeId<'CheckTemplateId'>(params.data.id),
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );
}
