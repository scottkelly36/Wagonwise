import {
  listPlacesRequestSchema,
  markPlaceRequestSchema,
  nearbyPlacesRequestSchema,
  placeIdParamsSchema,
  sharePlaceRequestSchema,
  placesCompanyParamsSchema,
  updatePlaceRequestSchema,
} from '@wagonwise/contracts/places';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import type { PlaceActor } from '../application/authorization.js';
import type { Forbidden, PlaceNotFound } from '../application/errors.js';
import {
  deletePlace,
  listPlaces,
  markPlace,
  placesNear,
  sharePlace,
  updatePlace,
  type PlaceDeps,
} from '../application/places.js';
import type {
  CallerDirectory,
  DriverIdentityDirectory,
  StaffCaller,
} from '../application/ports/directories.js';
import type { InvalidName, InvalidPlaceNote, SavedPlace } from '../domain/place.js';

export interface PlacesRouteDeps {
  readonly places: PlaceDeps;
  readonly callerDirectory: CallerDirectory;
  readonly identities: DriverIdentityDirectory;
  /** Row-Level Security scope per request (migration 0036). */
  readonly dataScopes: DataScopes;
}

type PlacesError = Forbidden | PlaceNotFound | InvalidName | InvalidPlaceNote;

function statusFor(error: PlacesError): number {
  switch (error.tag) {
    case 'InvalidName':
    case 'InvalidPlaceNote':
      return 400;
    case 'Forbidden':
      return 403;
    case 'PlaceNotFound':
      return 404;
  }
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}

const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: PlacesError): Outcome => ({ status: statusFor(error), body: error });

function placeDto(place: SavedPlace) {
  return {
    id: place.id,
    category: place.category,
    name: place.name,
    ...(place.companyId === undefined ? {} : { companyId: place.companyId }),
    ...(place.note === undefined ? {} : { note: place.note }),
    location: place.location,
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  };
}

function scopeFor(caller: StaffCaller): DataScope {
  return caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };
}

/**
 * Saved places (the farm gate marked once, kept for the company). Two doors onto the same use cases:
 * `/places/*` for the company's drivers (driver token, `driver` data scope) and `/staff/places/*` for its
 * staff (staff token, company or platform scope). Every use case checks the caller's own permission, and
 * Row-Level Security (migration 0036) refuses to even find another company's rows.
 */
export function registerPlacesRoutes(app: FastifyInstance, deps: PlacesRouteDeps): void {
  function send(request: FastifyRequest, reply: FastifyReply, outcome: Outcome) {
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  async function asDriver(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (actor: PlaceActor) => Promise<Outcome>,
  ) {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const driverId = makeId<'DriverId'>(request.driverId);
    const identifier = await deps.identities.getIdentifier(driverId);
    if (identifier === null) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    return send(
      request,
      reply,
      await deps.dataScopes.run({ kind: 'driver', driverId, identifier }, () =>
        work({ kind: 'driver', driverId }),
      ),
    );
  }

  async function asStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (actor: PlaceActor) => Promise<Outcome>,
  ) {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(makeId<'StaffId'>(request.staffId));
    if (caller === null) return send(request, reply, { status: 403, body: { tag: 'Forbidden' } });
    return send(request, reply, await deps.dataScopes.run(scopeFor(caller), () => work(caller)));
  }

  // The same handlers for both doors: the actor differs, the rules do not.
  const mark = async (actor: PlaceActor, body: unknown): Promise<Outcome> => {
    const parsed = markPlaceRequestSchema.safeParse(body);
    if (!parsed.success) return INVALID;
    const result = await markPlace(deps.places, {
      actor,
      id: makeId<'SavedPlaceId'>(parsed.data.id),
      companyId:
        parsed.data.companyId === undefined
          ? undefined
          : makeId<'CompanyId'>(parsed.data.companyId),
      category: parsed.data.category,
      name: parsed.data.name,
      note: parsed.data.note,
      location: parsed.data.location,
    });
    return result.ok ? { status: 201, body: placeDto(result.value) } : failure(result.error);
  };
  const list = async (actor: PlaceActor, companyId: string | undefined): Promise<Outcome> => {
    const result = await listPlaces(deps.places, {
      actor,
      companyId: companyId === undefined ? undefined : makeId<'CompanyId'>(companyId),
    });
    return result.ok
      ? { status: 200, body: { places: result.value.map(placeDto) } }
      : failure(result.error);
  };
  const near = async (actor: PlaceActor, body: unknown): Promise<Outcome> => {
    const parsed = nearbyPlacesRequestSchema.safeParse(body);
    if (!parsed.success) return INVALID;
    const result = await placesNear(deps.places, {
      actor,
      companyId:
        parsed.data.companyId === undefined
          ? undefined
          : makeId<'CompanyId'>(parsed.data.companyId),
      location: parsed.data.location,
      radiusM: parsed.data.radiusM,
    });
    return result.ok
      ? { status: 200, body: { places: result.value.map(placeDto) } }
      : failure(result.error);
  };
  const update = async (actor: PlaceActor, params: unknown, body: unknown): Promise<Outcome> => {
    const p = placeIdParamsSchema.safeParse(params);
    const b = updatePlaceRequestSchema.safeParse(body);
    if (!p.success || !b.success) return INVALID;
    const result = await updatePlace(deps.places, {
      actor,
      id: makeId<'SavedPlaceId'>(p.data.id),
      name: b.data.name,
      category: b.data.category,
      note: b.data.note,
    });
    return result.ok ? { status: 200, body: placeDto(result.value) } : failure(result.error);
  };
  const remove = async (actor: PlaceActor, params: unknown): Promise<Outcome> => {
    const p = placeIdParamsSchema.safeParse(params);
    if (!p.success) return INVALID;
    const result = await deletePlace(deps.places, {
      actor,
      id: makeId<'SavedPlaceId'>(p.data.id),
    });
    return result.ok ? { status: 204 } : failure(result.error);
  };

  const share = async (actor: PlaceActor, params: unknown, body: unknown): Promise<Outcome> => {
    const p = placeIdParamsSchema.safeParse(params);
    const b = sharePlaceRequestSchema.safeParse(body);
    if (!p.success || !b.success) return INVALID;
    const result = await sharePlace(deps.places, {
      actor,
      id: makeId<'SavedPlaceId'>(p.data.id),
      companyId: makeId<'CompanyId'>(b.data.companyId),
    });
    return result.ok ? { status: 200, body: placeDto(result.value) } : failure(result.error);
  };

  // Drivers
  app.post('/places', (request, reply) =>
    asDriver(request, reply, (actor) => mark(actor, request.body)),
  );
  app.post('/places/list', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const parsed = listPlacesRequestSchema.safeParse(request.body);
      return parsed.success ? list(actor, parsed.data.companyId) : INVALID;
    }),
  );
  app.post('/places/nearby', (request, reply) =>
    asDriver(request, reply, (actor) => near(actor, request.body)),
  );
  app.put('/places/:id', (request, reply) =>
    asDriver(request, reply, (actor) => update(actor, request.params, request.body)),
  );
  app.post('/places/:id/share', (request, reply) =>
    asDriver(request, reply, (actor) => share(actor, request.params, request.body)),
  );
  app.delete('/places/:id', (request, reply) =>
    asDriver(request, reply, (actor) => remove(actor, request.params)),
  );

  // Staff (the dashboard)
  app.get('/staff/places/companies/:companyId/places', (request, reply) =>
    asStaff(request, reply, async (actor) => {
      const params = placesCompanyParamsSchema.safeParse(request.params);
      return params.success ? list(actor, params.data.companyId) : INVALID;
    }),
  );
  app.post('/staff/places/companies/:companyId/places', (request, reply) =>
    asStaff(request, reply, (actor) => mark(actor, request.body)),
  );
  app.put('/staff/places/:id', (request, reply) =>
    asStaff(request, reply, (actor) => update(actor, request.params, request.body)),
  );
  app.delete('/staff/places/:id', (request, reply) =>
    asStaff(request, reply, (actor) => remove(actor, request.params)),
  );
}
