import { createAccessTokenVerifier } from './auth/access-token-verifier.js';
import { ConfigError, loadConfig } from './config.js';
import { registerCongestionRoutes } from './congestion-routes.js';
import { createCoreClient } from './core-client.js';
import { registerFleetRoutes } from './fleet-routes.js';
import { registerFeedbackRoutes } from './feedback-routes.js';
import { registerHazardsRoutes } from './hazards-routes.js';
import { buildApp } from './host/build-app.js';
import { registerIdentityRoutes } from './identity-routes.js';
import { registerJobsRoutes } from './jobs-routes.js';
import { registerCamerasRoutes } from './cameras-routes.js';
import { registerFuelRoutes } from './fuel-routes.js';
import { registerParkingRoutes } from './parking-routes.js';
import { registerChecksRoutes } from './checks-routes.js';
import { registerHoursRoutes } from './hours-routes.js';
import { registerPlacesRoutes } from './places-routes.js';
import { registerWeatherRoutes } from './weather-routes.js';
import { registerSosRoutes } from './sos-routes.js';
import { registerWhat3wordsRoutes } from './what3words-routes.js';
import { registerSignupsRoutes } from './signups-routes.js';
import { registerWebhooksRoutes } from './webhooks-routes.js';
import { registerAppVersionRoutes } from './app-version-routes.js';
import { registerRoutingRoutes } from './routing-routes.js';

function bootConfig() {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = bootConfig();
const app = buildApp(config);

const routeDeps = {
  coreClient: createCoreClient(config.coreInternalUrl, config.coreInternalKey),
  accessTokenVerifier: createAccessTokenVerifier(config.coreInternalUrl, config.coreInternalKey),
};
registerIdentityRoutes(app, routeDeps);
registerRoutingRoutes(app, routeDeps);
registerHazardsRoutes(app, routeDeps);
registerFeedbackRoutes(app, routeDeps);
registerCongestionRoutes(app, routeDeps);
registerParkingRoutes(app, routeDeps);
registerCamerasRoutes(app, routeDeps);
registerFuelRoutes(app, routeDeps);
registerPlacesRoutes(app, routeDeps);
registerChecksRoutes(app, routeDeps);
registerHoursRoutes(app, routeDeps);
registerWeatherRoutes(app, routeDeps);
registerWhat3wordsRoutes(app, routeDeps);
registerSosRoutes(app, routeDeps);
registerSignupsRoutes(app, routeDeps);
registerWebhooksRoutes(app, {
  coreClient: routeDeps.coreClient,
  resendWebhookSecret: config.resendWebhookSecret,
  nowSeconds: () => Math.floor(Date.now() / 1000),
});
registerAppVersionRoutes(app, { appVersion: config.appVersion });
registerFleetRoutes(app, routeDeps);
registerJobsRoutes(app, routeDeps);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'error during shutdown');
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exit(1);
}
