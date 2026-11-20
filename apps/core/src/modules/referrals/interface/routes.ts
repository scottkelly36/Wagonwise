import {
  REFERRAL_REWARD_POUNDS,
  claimRewardRequestSchema,
  createReferralRequestSchema,
  referralCodeParamsSchema,
  referralIdParamsSchema,
  setReferralStatusRequestSchema,
} from '@wagonwise/contracts/referrals';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  claimReward,
  listReferrals,
  lookupCode,
  myReferrals,
  recordReferral,
  setReferralStatus,
  type CallerDirectory,
  type DriverLabels,
  type ReferralDeps,
  type StaffCaller,
} from '../application/referrals.js';
import type { Referral } from '../domain/referral.js';

export interface ReferralRouteDeps {
  readonly referrals: ReferralDeps;
  readonly callerDirectory: CallerDirectory;
  readonly driverLabels: DriverLabels;
}

const STATUS: Record<string, number> = {
  Forbidden: 403,
  NotFound: 404,
  AlreadyReferred: 409,
  WrongStatus: 409,
};

/**
 * Drivers see their own code and referrals and claim a reward that is due; WagonWise staff record a referral when a firm joins and
 * move it on (paid, sent, or not qualifying). Staff routes are for WagonWise staff only (checked in the use case).
 */
export function registerReferralRoutes(app: FastifyInstance, deps: ReferralRouteDeps): void {
  const invalid = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(400).send({ error: 'invalid_request', requestId: request.id });
  const refuse = (request: FastifyRequest, reply: FastifyReply, error: { readonly tag: string }) =>
    reply.status(STATUS[error.tag] ?? 400).send({ ...error, requestId: request.id });
  const asDriver = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.driverId === undefined) {
      await reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    return request.driverId;
  };
  const asStaff = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<StaffCaller | undefined> => {
    if (request.staffId === undefined) {
      await reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null) {
      await reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
      return undefined;
    }
    return caller;
  };
  const staffDto = async (r: Referral) => ({
    id: r.id,
    code: r.code,
    driverLabel: await deps.driverLabels.label(r.driverId),
    firmName: r.firmName,
    status: r.status,
    rewardEmail: r.rewardEmail,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });

  app.get('/referrals/me', async (request, reply) => {
    const driverId = await asDriver(request, reply);
    if (driverId === undefined) return reply;
    const mine = await myReferrals(deps.referrals, driverId);
    return reply.status(200).send({
      code: mine.code,
      rewardPounds: REFERRAL_REWARD_POUNDS,
      referrals: mine.referrals.map((r) => ({
        id: r.id,
        firmName: r.firmName,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  app.post('/referrals/:id/claim', async (request, reply) => {
    const driverId = await asDriver(request, reply);
    if (driverId === undefined) return reply;
    const params = referralIdParamsSchema.safeParse(request.params);
    const body = claimRewardRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(request, reply);
    const result = await claimReward(deps.referrals, driverId, params.data.id, body.data.email);
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(200).send({ id: result.value.id, status: result.value.status });
  });

  app.get('/staff/referrals', async (request, reply) => {
    const caller = await asStaff(request, reply);
    if (caller === undefined) return reply;
    const result = await listReferrals(deps.referrals, caller);
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(200).send({ referrals: await Promise.all(result.value.map(staffDto)) });
  });

  app.get('/staff/referrals/codes/:code', async (request, reply) => {
    const caller = await asStaff(request, reply);
    if (caller === undefined) return reply;
    const params = referralCodeParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(request, reply);
    const result = await lookupCode(deps.referrals, caller, params.data.code);
    if (!result.ok) return refuse(request, reply, result.error);
    return reply
      .status(200)
      .send({ code: params.data.code, driverLabel: await deps.driverLabels.label(result.value) });
  });

  app.post('/staff/referrals', async (request, reply) => {
    const caller = await asStaff(request, reply);
    if (caller === undefined) return reply;
    const body = createReferralRequestSchema.safeParse(request.body);
    if (!body.success) return invalid(request, reply);
    const result = await recordReferral(deps.referrals, caller, body.data);
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(201).send(await staffDto(result.value));
  });

  app.put('/staff/referrals/:id/status', async (request, reply) => {
    const caller = await asStaff(request, reply);
    if (caller === undefined) return reply;
    const params = referralIdParamsSchema.safeParse(request.params);
    const body = setReferralStatusRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(request, reply);
    const result = await setReferralStatus(
      deps.referrals,
      caller,
      params.data.id,
      body.data.status,
    );
    if (!result.ok) return refuse(request, reply, result.error);
    return reply.status(200).send(await staffDto(result.value));
  });
}
