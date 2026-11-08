import {
  addEntryRequestSchema,
  createProspectRequestSchema,
  entryIdParamsSchema,
  importRequestSchema,
  prospectIdParamsSchema,
  updateProspectRequestSchema,
} from '@wagonwise/contracts/sales';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  addEntry,
  createProspect,
  deleteEntry,
  deleteProspect,
  importProspects,
  listSales,
  updateProspect,
  type CallerDirectory,
  type SalesDeps,
  type StaffCaller,
} from '../application/sales.js';
import type { Prospect, SalesEntry } from '../domain/sales.js';

export interface SalesRouteDeps {
  readonly sales: SalesDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

const prospectDto = (p: Prospect) => ({
  id: p.id,
  name: p.name,
  ...(p.town === undefined ? {} : { town: p.town }),
  ...(p.fleetSize === undefined ? {} : { fleetSize: p.fleetSize }),
  ...(p.haulageType === undefined ? {} : { haulageType: p.haulageType }),
  ...(p.website === undefined ? {} : { website: p.website }),
  ...(p.phone === undefined ? {} : { phone: p.phone }),
  ...(p.email === undefined ? {} : { email: p.email }),
  ...(p.contactPerson === undefined ? {} : { contactPerson: p.contactPerson }),
  legalForm: p.legalForm,
  relationship: p.relationship,
  stage: p.stage,
  ...(p.nextStep === undefined ? {} : { nextStep: p.nextStep }),
  ...(p.nextStepOn === undefined ? {} : { nextStepOn: p.nextStepOn }),
  ...(p.notes === undefined ? {} : { notes: p.notes }),
  createdAt: p.createdAt.toISOString(),
});

const entryDto = (e: SalesEntry) => ({
  id: e.id,
  prospectId: e.prospectId,
  at: e.at.toISOString(),
  how: e.how,
  result: e.result,
  ...(e.pitch === undefined ? {} : { pitch: e.pitch }),
  ...(e.note === undefined ? {} : { note: e.note }),
});

const STATUS: Record<string, number> = {
  Forbidden: 403,
  NotFound: 404,
  OptedOut: 409,
  AlreadyListed: 409,
  InvalidProspect: 400,
  InvalidEntry: 400,
};

/**
 * WagonWise's own sales notebook: the firms being approached and a log of each contact. Every route is for WagonWise staff
 * only, checked in the use case and by Row-Level Security under it; nothing here is ever sent to anyone.
 */
export function registerSalesRoutes(app: FastifyInstance, deps: SalesRouteDeps): void {
  /** The signed-in WagonWise staff member, or the reply that says why not. */
  const asPlatform = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<StaffCaller | undefined> => {
    if (request.staffId === undefined) {
      await reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null || caller.kind !== 'platform') {
      await reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
      return undefined;
    }
    return caller;
  };
  const invalid = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(400).send({ error: 'invalid_request', requestId: request.id });
  const refuse = (request: FastifyRequest, reply: FastifyReply, error: { readonly tag: string }) =>
    reply.status(STATUS[error.tag] ?? 400).send({ ...error, requestId: request.id });
  const inPlatformScope = <T>(run: () => Promise<T>): Promise<T> =>
    deps.dataScopes.run({ kind: 'platform' }, run);

  app.get('/staff/sales', async (request, reply) => {
    const caller = await asPlatform(request, reply);
    if (caller === undefined) return reply;
    const result = await inPlatformScope(() => listSales(deps.sales, caller));
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(200).send({
      prospects: result.value.prospects.map(prospectDto),
      entries: result.value.entries.map(entryDto),
    });
  });

  app.post('/staff/sales/prospects', async (request, reply) => {
    const caller = await asPlatform(request, reply);
    if (caller === undefined) return reply;
    const body = createProspectRequestSchema.safeParse(request.body);
    if (!body.success) return invalid(request, reply);
    const result = await inPlatformScope(() => createProspect(deps.sales, caller, body.data));
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(201).send(prospectDto(result.value));
  });

  app.put('/staff/sales/prospects/:id', async (request, reply) => {
    const caller = await asPlatform(request, reply);
    if (caller === undefined) return reply;
    const params = prospectIdParamsSchema.safeParse(request.params);
    const body = updateProspectRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(request, reply);
    const result = await inPlatformScope(() =>
      updateProspect(deps.sales, caller, makeId<'ProspectId'>(params.data.id), body.data),
    );
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(200).send(prospectDto(result.value));
  });

  app.delete('/staff/sales/prospects/:id', async (request, reply) => {
    const caller = await asPlatform(request, reply);
    if (caller === undefined) return reply;
    const params = prospectIdParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(request, reply);
    const result = await inPlatformScope(() =>
      deleteProspect(deps.sales, caller, makeId<'ProspectId'>(params.data.id)),
    );
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(204).send();
  });

  app.post('/staff/sales/prospects/:id/entries', async (request, reply) => {
    const caller = await asPlatform(request, reply);
    if (caller === undefined) return reply;
    const params = prospectIdParamsSchema.safeParse(request.params);
    const body = addEntryRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(request, reply);
    const result = await inPlatformScope(() =>
      addEntry(deps.sales, caller, makeId<'ProspectId'>(params.data.id), {
        ...body.data,
        at: body.data.at === undefined ? undefined : new Date(body.data.at),
      }),
    );
    if (!result.ok) return refuse(request, reply, result.error);
    return reply
      .status(201)
      .send({ prospect: prospectDto(result.value.prospect), entry: entryDto(result.value.entry) });
  });

  app.delete('/staff/sales/entries/:id', async (request, reply) => {
    const caller = await asPlatform(request, reply);
    if (caller === undefined) return reply;
    const params = entryIdParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(request, reply);
    const result = await inPlatformScope(() =>
      deleteEntry(deps.sales, caller, makeId<'SalesEntryId'>(params.data.id)),
    );
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(204).send();
  });

  app.post('/staff/sales/import', async (request, reply) => {
    const caller = await asPlatform(request, reply);
    if (caller === undefined) return reply;
    const body = importRequestSchema.safeParse(request.body);
    if (!body.success) return invalid(request, reply);
    const result = await inPlatformScope(() => importProspects(deps.sales, caller, body.data.rows));
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(200).send(result.value);
  });
}
