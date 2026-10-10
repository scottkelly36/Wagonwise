import type { AppVersionResponse } from '@wagonwise/contracts/app-version';
import type { FastifyInstance } from 'fastify';

export interface AppVersionRouteDeps {
  readonly appVersion: AppVersionResponse;
}

/**
 * Tells the driver app the newest version in the store, and the oldest still allowed, so it can say "a new version is available".
 * Public (a driver who cannot sign in because their build is too old still needs to be told) and read from the environment, so
 * announcing a build is a setting, not a deploy of new code. No core call: the BFF owns nothing but this.
 */
export function registerAppVersionRoutes(app: FastifyInstance, deps: AppVersionRouteDeps): void {
  app.get('/app/version', (_request, reply) => reply.status(200).send(deps.appVersion));
}
