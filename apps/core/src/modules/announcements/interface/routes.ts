import {
  announcementIdParamsSchema,
  announcementPreferenceSchema,
  createAnnouncementRequestSchema,
} from '@wagonwise/contracts/announcements';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  getPushPreference,
  latestAnnouncement,
  listAnnouncements,
  setPushPreference,
  type AnnouncementDeps,
  type CallerDirectory,
  type StaffCaller,
} from '../application/announcements.js';
import type { Announcement } from '../domain/announcement.js';

export interface AnnouncementRouteDeps {
  readonly announcements: AnnouncementDeps;
  readonly callerDirectory: CallerDirectory;
}

const announcementDto = (a: Announcement) => ({
  id: a.id,
  title: a.title,
  body: a.body,
  publishedAt: a.publishedAt.toISOString(),
  ...(a.pushedAt === undefined ? {} : { pushedAt: a.pushedAt.toISOString() }),
  ...(a.pushedTo === undefined ? {} : { pushedTo: a.pushedTo }),
});

const STATUS: Record<string, number> = {
  Forbidden: 403,
  NotFound: 404,
  InvalidAnnouncement: 400,
  PushTooSoon: 429,
};

/**
 * Notes to the drivers about what has changed in the app. Writing, listing and removing are for WagonWise staff only (checked in the use case);
 * any signed-in driver may read the newest one.
 */
export function registerAnnouncementRoutes(
  app: FastifyInstance,
  deps: AnnouncementRouteDeps,
): void {
  /** The signed-in WagonWise staff member, or the reply that says why not. */
  const asPlatform = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ readonly caller: StaffCaller; readonly staffId: string } | undefined> => {
    if (request.staffId === undefined) {
      await reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null || caller.kind !== 'platform') {
      await reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
      return undefined;
    }
    return { caller, staffId: request.staffId };
  };
  const invalid = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(400).send({ error: 'invalid_request', requestId: request.id });
  const refuse = (request: FastifyRequest, reply: FastifyReply, error: { readonly tag: string }) =>
    reply.status(STATUS[error.tag] ?? 400).send({ ...error, requestId: request.id });

  app.get('/staff/announcements', async (request, reply) => {
    const who = await asPlatform(request, reply);
    if (who === undefined) return reply;
    const result = await listAnnouncements(deps.announcements, who.caller);
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(200).send({ announcements: result.value.map(announcementDto) });
  });

  app.post('/staff/announcements', async (request, reply) => {
    const who = await asPlatform(request, reply);
    if (who === undefined) return reply;
    const body = createAnnouncementRequestSchema.safeParse(request.body);
    if (!body.success) return invalid(request, reply);
    const result = await createAnnouncement(deps.announcements, who.caller, who.staffId, body.data);
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(201).send({
      ...announcementDto(result.value.announcement),
      ...(result.value.pushFailed === true ? { pushFailed: true } : {}),
    });
  });

  app.delete('/staff/announcements/:id', async (request, reply) => {
    const who = await asPlatform(request, reply);
    if (who === undefined) return reply;
    const params = announcementIdParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(request, reply);
    const result = await deleteAnnouncement(
      deps.announcements,
      who.caller,
      makeId<'AnnouncementId'>(params.data.id),
    );
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(204).send();
  });

  // The driver app: the newest note, or `null` when there has never been one. Always 200.
  app.get('/announcements/latest', async (request, reply) => {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const latest = await latestAnnouncement(deps.announcements);
    return reply
      .status(200)
      .send({ announcement: latest === null ? null : announcementDto(latest) });
  });

  // A driver's choice about notifications from WagonWise about what has changed: on unless they turn it off.
  app.get('/announcements/preference', async (request, reply) => {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const pushes = await getPushPreference(deps.announcements, request.driverId);
    return reply.status(200).send({ pushes });
  });

  app.put('/announcements/preference', async (request, reply) => {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const body = announcementPreferenceSchema.safeParse(request.body);
    if (!body.success) return invalid(request, reply);
    await setPushPreference(deps.announcements, request.driverId, body.data.pushes);
    return reply.status(200).send({ pushes: body.data.pushes });
  });
}
