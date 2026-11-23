import {
  flowEventsRequestSchema,
  portalEventsRequestSchema,
  PORTAL_FORMS,
  PORTAL_PAGES,
  siteVisitRequestSchema,
  usageSectionParamsSchema,
} from '@wagonwise/contracts/usage';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  getUsageSection,
  type CallerDirectory,
  type StaffCaller,
  type UsageDeps,
} from '../application/usage.js';
import { getPortalReport, type PortalReportDeps } from '../application/portal-report.js';
import { recordPortalEvents, type PortalEventDeps } from '../application/portal-events.js';
import { recordFlowEvents, type FlowEventDeps } from '../application/flow-events.js';
import { recordSiteVisit, type SiteVisitDeps } from '../application/site-visits.js';

export interface UsageRouteDeps {
  readonly usage: UsageDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
  readonly flowEvents: FlowEventDeps;
  readonly siteVisits: SiteVisitDeps;
  readonly portalEvents: PortalEventDeps;
  readonly portalReport: PortalReportDeps;
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

type Params = z.infer<typeof usageSectionParamsSchema>;

/** `GET /staff/usage/:section`: one view of how the app is being used, for WagonWise staff only (checked here and again in the use case).
 *  Each section is its own set of queries and its own request, so the page only waits for the view it is showing. */
export function registerUsageRoutes(app: FastifyInstance, deps: UsageRouteDeps): void {
  async function platformCaller(request: FastifyRequest, reply: FastifyReply) {
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
  }

  app.get('/staff/usage/:section', async (request, reply) => {
    const params = usageSectionParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const caller = await platformCaller(request, reply);
    if (caller === undefined) return reply;
    const started = Date.now();
    const body = await deps.dataScopes.run({ kind: 'platform' }, () =>
      sectionBody(deps, caller, params.data.section),
    );
    // How long each view took, so a slow one shows up in the log.
    request.log.info({ section: params.data.section, ms: Date.now() - started }, 'usage section');
    if (body === undefined)
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    return reply.status(200).send(body);
  });

  /** `POST /staff/usage/portal-events`: a batch of pages and form steps from one sitting in the portal. The company is the signed-in
   *  person's own; the person is not kept (docs/company-account-states-scope.md, "Portal tracking"). Always `{ recorded }`. */
  app.post('/staff/usage/portal-events', async (request, reply) => {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const body = portalEventsRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    // Written in the person's own scope, so the database itself lets a company add rows only for itself.
    const recorded = await deps.dataScopes.run(
      caller.kind === 'platform'
        ? { kind: 'platform' }
        : { kind: 'company', companyId: caller.companyId },
      () => recordPortalEvents(deps.portalEvents, caller, body.data),
    );
    return reply.status(200).send({ recorded });
  });

  /** `POST /site/visits`: a visit to the website, forwarded by the driver BFF from `/signups/visits` on the website's own address. No
   *  account and nothing that identifies the visitor (docs/modules.md, "Website visits"). Always 204, so a page never waits on it. */
  app.post('/site/visits', async (request, reply) => {
    const body = siteVisitRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    await recordSiteVisit(deps.siteVisits, body.data);
    return reply.status(204).send();
  });

  /** `POST /usage/flow-events`: a batch of steps and choices from one session of the app. Needs a signed-in driver, so strangers cannot
   *  fill the table, but who it was is not passed on or kept: the events are anonymous (docs/flow-tracking-plan.md). */
  app.post('/usage/flow-events', async (request, reply) => {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const body = flowEventsRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const recorded = await recordFlowEvents(deps.flowEvents, {
      sessionId: body.data.sessionId,
      appVersion: body.data.appVersion,
      platform: body.data.platform,
      updateDate: body.data.updateDate,
      events: body.data.events.map((e) => ({
        event: e.event,
        choice: e.choice,
        at: new Date(e.at),
      })),
    });
    return reply.status(200).send({ recorded });
  });
}

/** The body of one section, or undefined when the caller may not read it. */
async function sectionBody(
  deps: UsageRouteDeps,
  caller: StaffCaller,
  section: Params['section'],
): Promise<object | undefined> {
  const generatedAt = (d: Date) => d.toISOString();
  if (section === 'portal') {
    const result = await getPortalReport(deps.portalReport, caller);
    if (!result.ok) return undefined;
    const r = result.value;
    const seen = new Map(r.pages.map((p) => [p.page, p.sessions]));
    return {
      generatedAt: generatedAt(deps.portalReport.clock.now()),
      windowDays: r.windowDays,
      sessions: r.sessions,
      firms: r.firms,
      // Every page, so one nobody opened shows as a zero.
      pages: PORTAL_PAGES.map((page) => ({ page, sessions: seen.get(page) ?? 0 })),
      forms: PORTAL_FORMS.map((form) => {
        const f = r.forms.find((x) => x.form === form);
        return {
          form,
          opened: f?.opened ?? 0,
          sent: f?.sent ?? 0,
          left: f?.left ?? 0,
          errors: f?.errors ?? 0,
          medianSecondsToSend: f?.medianSecondsToSend ?? null,
        };
      }),
      errorFields: r.errorFields,
      settingUp: r.settingUp.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        lastSeenAt: iso(f.lastSeenAt),
      })),
    };
  }
  const usage = deps.usage;
  switch (section) {
    case 'overview': {
      const result = await getUsageSection(usage, caller, 'overview');
      return result.ok
        ? { ...result.value, generatedAt: generatedAt(result.value.generatedAt) }
        : undefined;
    }
    case 'drivers': {
      const result = await getUsageSection(usage, caller, 'drivers');
      return result.ok
        ? { ...result.value, generatedAt: generatedAt(result.value.generatedAt) }
        : undefined;
    }
    case 'activity': {
      const result = await getUsageSection(usage, caller, 'activity');
      return result.ok
        ? { ...result.value, generatedAt: generatedAt(result.value.generatedAt) }
        : undefined;
    }
    case 'firms': {
      const result = await getUsageSection(usage, caller, 'firms');
      if (!result.ok) return undefined;
      return {
        generatedAt: generatedAt(result.value.generatedAt),
        firmList: result.value.firms.map((f) => ({
          id: f.id,
          name: f.name,
          drivers: f.drivers,
          vehicles: f.vehicles,
          staff: f.staff,
          jobsThisMonth: f.jobsThisMonth,
          lastActiveAt: iso(f.lastActiveAt),
        })),
      };
    }
    // Flows and the website are counts over a window and carry no time of their own.
    case 'flows': {
      const result = await getUsageSection(usage, caller, 'flows');
      return result.ok
        ? { ...result.value, generatedAt: generatedAt(usage.clock.now()) }
        : undefined;
    }
    case 'site': {
      const result = await getUsageSection(usage, caller, 'site');
      return result.ok
        ? { ...result.value, generatedAt: generatedAt(usage.clock.now()) }
        : undefined;
    }
  }
}
